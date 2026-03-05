import ioRedis from 'ioredis';
import { injectable, inject } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { Job, UnrecoverableError } from 'bullmq';
import { type AppConfig } from '@src/common/interfaces';
import { ChangesetStatus, type IOsmAPI } from '@src/clients/osmAPI/types';
import type { IOsmSyncTracker, PatchEntitiesRequest } from '@src/clients/osmSyncTracker/types';
import { SERVICES } from '@src/common/constants';
import { MergeRequest } from '@src/clients/changeMerger/types';
import { DEFAULT_CREATE_CHANGESET_TAGS } from '@src/clients/osmAPI/constants';
import { RedisClient } from '@src/redis/client';
import { determineChangesetStatus } from '@src/clients/osmAPI/helpers';
import { ChangesetNotFoundError } from '@src/clients/osmAPI/errors';
import { QueueEnum, WorkerEnum } from '../../constants';
import { BullWorkerProvider } from '../bullWorkerProvider';
import { ChangesetUploadData, ChangesetUploadReturn } from './types';

@injectable()
export class PreUploadWorker extends BullWorkerProvider<ChangesetUploadData, ChangesetUploadReturn> {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.METRICS) metricsRegistry: Registry,
    @inject(SERVICES.APP_CONFIG) appConfig: AppConfig,
    @inject(SERVICES.REDIS_WORKER_CONNECTION) connection: ioRedis,
    @inject(RedisClient) private readonly redis: RedisClient,
    @inject(SERVICES.OSM_API_CLIENT) private readonly osmApi: IOsmAPI,
    @inject(SERVICES.OSM_SYNC_TRACKER_CLIENT) private readonly tracker: IOsmSyncTracker
  ) {
    const workerLogger = logger.child({ component: WorkerEnum.CHANGESET_PRE_UPLOAD });
    const { workerOptions } = appConfig;
    super({ logger: workerLogger, metricsRegistry, connection, workerOptions });

    this.logger.info({ msg: `initializing ${this.queueName} queue worker`, queueName: this.queueName, workerOptions: this.workerOptions });
  }

  protected getQueueName(): QueueEnum {
    return QueueEnum.CHANGESET_PRE_UPLOAD;
  }

  protected async processJob(job: Job<ChangesetUploadData>): Promise<ChangesetUploadReturn> {
    const { changesetId, flowAttempt } = job.data;

    let shouldCreateOsmChangeset: boolean = false;

    this.logger.info({ msg: 'started job processing', queueName: this.queueName, jobId: job.id, jobName: job.name, changesetId, flowAttempt });

    // 1. redis::GET {changesetId}
    const mergeRequest = await this.redis.get<MergeRequest>(changesetId);
    if (mergeRequest === null) {
      this.logger.error({ msg: 'could not find asset in redis, job is unrecoverable', changesetId, flowAttempt });
      throw new UnrecoverableError(`changes for changeset ${changesetId} not found in redis`);
    }

    // 2. osm-sync-tracker::GET /changeset/{changesetId}
    const trackerChangeset = await this.tracker.getChangeset(changesetId);
    let changesetOsmId: number | undefined = trackerChangeset?.osmId;

    if (changesetOsmId) {
      try {
        // 3.i. osm-api::GET /changeset/{changesetId}
        const osmChangeset = await this.osmApi.getChangeset(changesetOsmId);
        const status = determineChangesetStatus(osmChangeset);

        // if the changeset is closed and empty, we must create a new one
        if (status === ChangesetStatus.CLOSED_AND_EMPTY) {
          shouldCreateOsmChangeset = true;
        }
      } catch (error) {
        // if the osm id in tracker is unknown to OSM, we must create a new one
        if (error instanceof ChangesetNotFoundError) {
          this.logger.warn({ msg: "changeset's osmId in tracker not found in OSM, force creating new changeset", changesetId, changesetOsmId });
          shouldCreateOsmChangeset = true;
        } else {
          throw error;
        }
      }
    } else {
      shouldCreateOsmChangeset = true;
    }

    if (shouldCreateOsmChangeset) {
      this.logger.info({ msg: 'creating new OSM changeset', changesetId, flowAttempt });

      // 3.ii. osm-api::PUT /changeset/create
      changesetOsmId = await this.osmApi.createChangeset({
        tags: {
          ...DEFAULT_CREATE_CHANGESET_TAGS,
          changeset_id: changesetId,
          flow_attempt: flowAttempt.toString(),
        },
      });

      // 4. osm-sync-tracker::POST /changeset OR osm-sync-tracker::PATCH /changeset/{changesetId}
      if (trackerChangeset === null) {
        await this.tracker.postChangeset({ changesetId, osmId: changesetOsmId });
      } else {
        await this.tracker.patchChangeset(changesetId, { osmId: changesetOsmId });
      }
    }

    // 5. osm-sync-tracker::PATCH /entity/_bulk
    const patchEntitiesRequest: PatchEntitiesRequest = mergeRequest.changes.map((entityChange) => ({
      entityId: entityChange.externalId,
      fileId: entityChange.fileId,
      action: entityChange.action,
      changesetId,
    }));
    await this.tracker.patchEntities(patchEntitiesRequest);

    return { changesetId, osmId: changesetOsmId! };
  }
}
