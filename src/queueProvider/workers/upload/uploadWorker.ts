import ioRedis from 'ioredis';
import { injectable, inject } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { Job } from 'bullmq';
import { type AppConfig } from '@src/common/interfaces';
import type { IOsmAPI } from '@src/clients/osmAPI/types';
import type { IOsmSyncTracker } from '@src/clients/osmSyncTracker/types';
import { SERVICES } from '@src/common/constants';
import type { IChangeMerger, MergeRequest } from '@src/clients/changeMerger/types';
import { RedisClient } from '@src/redis/client';
import { attemptSafely } from '@src/common/util';
import { QueueEnum, WorkerEnum } from '../../constants';
import { BullWorkerProvider } from '../bullWorkerProvider';
import { ChangesetUploadData, ChangesetUploadReturn } from './types';

@injectable()
export class UploadWorker extends BullWorkerProvider<ChangesetUploadData, ChangesetUploadReturn> {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.METRICS) metricsRegistry: Registry,
    @inject(SERVICES.APP_CONFIG) appConfig: AppConfig,
    @inject(SERVICES.REDIS_WORKER_CONNECTION) connection: ioRedis,
    @inject(RedisClient) private readonly redis: RedisClient,
    @inject(SERVICES.OSM_API_CLIENT) private readonly osmApi: IOsmAPI,
    @inject(SERVICES.OSM_SYNC_TRACKER_CLIENT) private readonly tracker: IOsmSyncTracker,
    @inject(SERVICES.CHANGE_MERGER_CLIENT) private readonly changeMerger: IChangeMerger
  ) {
    const workerLogger = logger.child({ component: WorkerEnum.CHANGESET_UPLOAD });
    const { workerOptions } = appConfig;
    super({ logger: workerLogger, metricsRegistry, connection, workerOptions });

    this.logger.info({ msg: `initializing ${this.queueName} queue worker`, queueName: this.queueName, workerOptions: this.workerOptions });
  }

  protected getQueueName(): QueueEnum {
    return QueueEnum.CHANGESET_UPLOAD;
  }

  protected async processJob(job: Job<ChangesetUploadData>): Promise<ChangesetUploadReturn> {
    const { changesetId } = job.data;

    this.logger.info({ msg: 'started job processing', queueName: this.queueName, jobId: job.id, jobName: job.name, changesetId });

    const childrenValues = await job.getChildrenValues();
    const { osmId: changesetOsmId } = childrenValues[`${changesetId}-pre-upload`] as ChangesetUploadReturn;

    // 1. osm-api::GET /changeset/{changesetId}.json
    const changeset = await this.osmApi.getChangeset(changesetOsmId);

    if (!changeset.changeset.open || changeset.changeset.changes_count > 0) {
      throw new Error(); // TODO: branch out and handle
    }

    // 2. redis::GET {changesetId}
    const mergeRequest = await this.redis.get<MergeRequest>(changesetId);
    if (mergeRequest === null) {
      throw new Error(`changes for changeset ${changesetId} not found in redis`); // TODO: handle error
    }

    // 3. change-merger::POST /change/merge
    const { change } = await this.changeMerger.merge({ ...mergeRequest, changesetId: changesetOsmId });

    try {
      // 4. osm-api::POST /changeset/{changesetId}/upload
      await this.osmApi.uploadDiff(changesetOsmId, change);
    } catch (error) {
      // TODO: handle different erroring branches
      this.logger.info({ err: error });
      throw error;
    }

    // 5. osm-api::PUT /changeset/{changesetId}/close
    await attemptSafely(async () => this.osmApi.closeChangeset(changesetOsmId));

    // TODO: should push a new cleanup job (which will be handled by a batchWorker)
    await attemptSafely(async () => this.redis.delete(changesetId));

    return { changesetId, osmId: changesetOsmId };
  }
}
