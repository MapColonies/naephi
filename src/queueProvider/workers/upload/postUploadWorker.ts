import ioRedis from 'ioredis';
import { injectable, inject } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { Job, UnrecoverableError } from 'bullmq';
import { type AppConfig } from '@src/common/interfaces';
import type { IOsmSyncTracker } from '@src/clients/osmSyncTracker/types';
import { SERVICES } from '@src/common/constants';
import type { IChangeMerger } from '@src/clients/changeMerger/types';
import type { IIdToOsm } from '@src/clients/idToOsm/types';
import { IdConflictError } from '@src/clients/idToOsm/errors';
import { QueueEnum, WorkerEnum } from '../../constants';
import { BullWorkerProvider } from '../bullWorkerProvider';
import { ChangesetUploadData, ChangesetUploadReturn } from './types';
import { prepareEntityBulkRequest } from './util';

@injectable()
export class PostUploadWorker extends BullWorkerProvider<ChangesetUploadData, void> {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.METRICS) metricsRegistry: Registry,
    @inject(SERVICES.APP_CONFIG) appConfig: AppConfig,
    @inject(SERVICES.REDIS_WORKER_CONNECTION) connection: ioRedis,
    @inject(SERVICES.CHANGE_MERGER_CLIENT) private readonly changeMerger: IChangeMerger,
    @inject(SERVICES.ID_TO_OSM_CLIENT) private readonly idToOsm: IIdToOsm,
    @inject(SERVICES.OSM_SYNC_TRACKER_CLIENT) private readonly tracker: IOsmSyncTracker
  ) {
    const workerLogger = logger.child({ component: WorkerEnum.CHANGESET_PRE_UPLOAD });
    const { workerOptions } = appConfig;
    super({ logger: workerLogger, metricsRegistry, connection, workerOptions });

    this.logger.info({ msg: `initializing ${this.queueName} queue worker`, queueName: this.queueName, workerOptions: this.workerOptions });
  }

  protected getQueueName(): QueueEnum {
    return QueueEnum.CHANGESET_POST_UPLOAD;
  }

  protected async processJob(job: Job<ChangesetUploadData>): Promise<void> {
    const { changesetId } = job.data;

    this.logger.info({ msg: 'started job processing', queueName: this.queueName, jobId: job.id, jobName: job.name, changesetId });

    const childrenValues = await job.getChildrenValues();
    const { osmId: changesetOsmId } = childrenValues[`${changesetId}-upload`] as ChangesetUploadReturn;

    // 1. change-merger::GET /change/{changesetId}/interpret
    const interpretation = await this.changeMerger.interpret(changesetOsmId, 'api', { action: ['create', 'delete'] });

    // 2. id-2-osm::POST /entity/bulk
    const bulkEntityRequest = prepareEntityBulkRequest(interpretation);
    if (bulkEntityRequest !== null) {
      try {
        await this.idToOsm.bulk(bulkEntityRequest);
      } catch (error) {
        if (error instanceof IdConflictError) {
          this.logger.error({
            msg: 'job processing failed due to id2osm entity bulk conflict, job is marked as failed',
            err: error,
            jobId: job.id,
            changesetId,
          });
          throw new UnrecoverableError('id-2-osm entity bulk conflict detected');
        }
        throw error;
      }
    }

    // 3. osm-sync-tracker::PATCH /changeset/{changesetId}/entities
    await this.tracker.closeChangesetEntities(changesetId);
  }
}
