import ioRedis from 'ioredis';
import { injectable, inject } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { Job } from 'bullmq';
import { type AppConfig } from '@src/common/interfaces';
import type { IOsmAPI } from '@src/clients/osmAPI/types';
import type { IOsmSyncTracker, PatchEntitiesRequest } from '@src/clients/osmSyncTracker/types';
import { SERVICES } from '@src/common/constants';
import { MergeRequest } from '@src/clients/changeMerger/types';
import { DEFAULT_CREATE_CHANGESET_TAGS } from '@src/clients/osmAPI/constants';
import { RedisClient } from '@src/redis/client';
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
    const { changesetId } = job.data;

    this.logger.info({ msg: 'started job processing', queueName: this.queueName, jobId: job.id, jobName: job.name, changesetId });

    // 1. redis::GET {changesetId}
    const mergeRequest = await this.redis.get<MergeRequest>(changesetId);
    if (mergeRequest === null) {
      throw new Error(`changes for changeset ${changesetId} not found in redis`); // TODO: handle error
    }

    // 2. osm-api::PUT /changeset/create
    const changesetOsmId = await this.osmApi.createChangeset({
      tags: {
        ...DEFAULT_CREATE_CHANGESET_TAGS,
        changesetId,
      },
    });

    // 3. osm-sync-tracker::POST /changeset
    await this.tracker.postChangeset({ changesetId, osmId: changesetOsmId });

    const patchEntitiesRequest: PatchEntitiesRequest = mergeRequest.changes.map((entityChange) => ({
      entityId: entityChange.externalId,
      fileId: entityChange.fileId,
      action: entityChange.action,
      changesetId,
    }));

    // 4. osm-sync-tracker::PATCH /entity/_bulk
    await this.tracker.patchEntities(patchEntitiesRequest);

    return { changesetId, osmId: changesetOsmId };
  }
}
