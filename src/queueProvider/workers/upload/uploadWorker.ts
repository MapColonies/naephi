import ioRedis from 'ioredis';
import { injectable, inject } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { Job, UnrecoverableError, WorkerOptions } from 'bullmq';
import { ChangesetStatus, type IOsmAPI } from '@src/clients/osmAPI/types';
import { SERVICES } from '@src/common/constants';
import type { IChangeMerger, MergeRequest } from '@src/clients/changeMerger/types';
import type { JobQueueProvider } from '@src/queueProvider/queues/interfaces';
import { determineChangesetStatus } from '@src/clients/osmAPI/helpers';
import { FlowManager } from '@src/flow/models/flowManager';
import {
  ChangesetAlreadyClosedError,
  ChangesetContentConflictError,
  ChangesetElementGoneError,
  ChangesetNotFoundError,
  ChangesetPayloadError,
  ChangesetPreconditionError,
  ChangesetTooLargeError,
} from '@src/clients/osmAPI/errors';
import { CLIENTS } from '@src/clients/constants';
import type { ConfigType } from '@src/common/config';
import type { IRedisClient } from '@src/redis/interfaces';
import { QueueEnum, QueueIdentifiers, WorkerEnum } from '../../constants';
import { BullWorkerProvider } from '../bullWorkerProvider';
import type { IOsmIdResolver } from '../../../osmIdResolver/interfaces';
import { ChangesetUploadData, ChangesetUploadReturn, CompleteChangesetIdentifiers } from './types';

interface ChangesetContext {
  changesetId: string;
  changesetOsmId: number;
  status: ChangesetStatus;
  flowAttempt: number;
}

@injectable()
export class UploadWorker extends BullWorkerProvider<ChangesetUploadData, ChangesetUploadReturn> {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.METRICS) metricsRegistry: Registry,
    @inject(SERVICES.CONFIG) config: ConfigType,
    @inject(SERVICES.BULLMQ_WORKER_CONNECTION) connection: ioRedis,
    @inject(SERVICES.REDIS_CLIENT) private readonly redis: IRedisClient,
    @inject(SERVICES.OSM_ID_RESOLVER) private readonly osmIdResolver: IOsmIdResolver,
    @inject(CLIENTS.OSM_API) private readonly osmApi: IOsmAPI,
    @inject(CLIENTS.CHANGE_MERGER) private readonly changeMerger: IChangeMerger,
    @inject(QueueEnum.CHANGESET_REDIS_CLEANUP) private readonly redisCleanupQueue: JobQueueProvider<CompleteChangesetIdentifiers>,
    @inject(QueueEnum.CHANGESET_OSM_CLEANUP) private readonly osmCleanupQueue: JobQueueProvider<CompleteChangesetIdentifiers>,
    @inject(FlowManager) private readonly flowManager: FlowManager
  ) {
    const workerLogger = logger.child({ component: WorkerEnum.CHANGESET_UPLOAD });
    const workerOptions = config.get(`app.queues.${QueueIdentifiers.CHANGESET_UPLOAD}.workerOptions`) as unknown as WorkerOptions;
    const prefix = config.get('bullmq.keyPrefix');

    super({ logger: workerLogger, metricsRegistry, connection, workerOptions: { ...workerOptions, prefix } });
  }

  protected getQueueName(): QueueEnum {
    return QueueEnum.CHANGESET_UPLOAD;
  }

  protected async processJob(job: Job<ChangesetUploadData>): Promise<ChangesetUploadReturn> {
    const { changesetId, flowAttempt } = job.data;

    this.logger.info({ msg: 'started job processing', queueName: this.queueName, jobId: job.id, jobName: job.name, changesetId, flowAttempt });

    const changesetOsmId = await this.osmIdResolver.resolve(job);

    // 1. osm-api::GET /changeset/{changesetId}.json
    const status = await this.getChangesetStatus(changesetOsmId);

    const context: ChangesetContext = { changesetId, changesetOsmId, status, flowAttempt };

    switch (status) {
      case ChangesetStatus.OPEN_AND_EMPTY: {
        // 2. redis::GET {changesetId}
        const mergeRequest = await this.redis.get<MergeRequest>(changesetId);

        if (mergeRequest === null) {
          this.logger.error({ msg: 'could not find asset in redis, job is unrecoverable', changesetId, flowAttempt });
          throw new UnrecoverableError(`changes for changeset ${changesetId} not found in redis`);
        }

        // 3. change-merger::POST /change/merge
        const { change } = await this.changeMerger.merge({ ...mergeRequest, changesetId: changesetOsmId });

        try {
          // 4. osm-api::POST /changeset/{changesetId}/upload
          await this.osmApi.uploadChangeset(changesetOsmId, change);
        } catch (error) {
          if (
            error instanceof ChangesetPayloadError ||
            error instanceof ChangesetNotFoundError ||
            error instanceof ChangesetContentConflictError ||
            error instanceof ChangesetElementGoneError ||
            error instanceof ChangesetPreconditionError ||
            error instanceof ChangesetTooLargeError
          ) {
            this.logger.error({ msg: 'could not upload changeset to osm due to unrecoverable error, job is unrecoverable', context, err: error });
            throw new UnrecoverableError(error.message);
          }

          if (error instanceof ChangesetAlreadyClosedError) {
            const status = await this.getChangesetStatus(changesetOsmId);

            if (status === ChangesetStatus.CLOSED_AND_FULL) {
              this.handleFullChangeset(context);
              break;
            }

            if (status === ChangesetStatus.CLOSED_AND_EMPTY) {
              await this.handleClosedAndEmptyChangeset(context);
            }
          }

          throw error;
        }
        break;
      }
      case ChangesetStatus.OPEN_AND_FULL:
      case ChangesetStatus.CLOSED_AND_FULL: {
        this.handleFullChangeset(context);
        break;
      }
      case ChangesetStatus.CLOSED_AND_EMPTY: {
        await this.handleClosedAndEmptyChangeset(context);
        break;
      }
    }

    // 5. publish cleanup jobs
    await this.publishCleanupJobs(context);

    return { changesetId, osmId: changesetOsmId };
  }

  private async getChangesetStatus(changesetOsmId: number): Promise<ChangesetStatus> {
    const changeset = await this.osmApi.getChangeset(changesetOsmId);
    const status = determineChangesetStatus(changeset.elements[0]);
    return status;
  }

  private handleFullChangeset(context: ChangesetContext): void {
    this.logger.info({ msg: 'changeset is closed and full, upload can be skipped', context });
  }

  private async handleClosedAndEmptyChangeset(context: ChangesetContext): Promise<never> {
    this.logger.warn({
      msg: 'changeset is closed and empty, another flow should be attempted while this flow is terminated',
      context,
    });

    await this.flowManager.initChangesetFlow({
      id: context.changesetId,
      flowAttempt: context.flowAttempt + 1,
    });

    throw new UnrecoverableError('flow is terminated, while another flow is attempted');
  }

  private async publishCleanupJobs(context: ChangesetContext): Promise<void> {
    const { changesetId, changesetOsmId } = context;

    this.logger.info({ msg: 'attempting to create cleanup jobs', context });

    try {
      await Promise.all([
        this.redisCleanupQueue.add(`${changesetId}-redis-cleanup`, { changesetId, osmId: changesetOsmId }, { jobId: `${changesetId}-redis-cleanup` }),
        this.osmCleanupQueue.add(`${changesetId}-osm-cleanup`, { changesetId, osmId: changesetOsmId }, { jobId: `${changesetId}-osm-cleanup` }),
      ]);
    } catch (error) {
      this.logger.error({ msg: 'failed to create one or more cleanup jobs', context, err: error });
    }
  }
}
