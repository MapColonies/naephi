import ioRedis from 'ioredis';
import { injectable, inject } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { Job, UnrecoverableError, WorkerOptions } from 'bullmq';
import type { IOsmSyncTracker } from '@src/clients/osmSyncTracker/types';
import { SERVICES } from '@src/common/constants';
import type { IChangeMerger } from '@src/clients/changeMerger/types';
import type { IIdToOsm } from '@src/clients/idToOsm/types';
import { IdConflictError } from '@src/clients/idToOsm/errors';
import { CLIENTS } from '@src/clients/constants';
import { QueueEnum, QueueIdentifiers, WorkerEnum } from '../../constants';
import { BullWorkerProvider } from '../bullWorkerProvider';
import type { IOsmIdResolver } from '../../../osmIdResolver/interfaces';
import { ChangesetUploadData } from './types';
import { prepareEntityBulkRequest } from './util';
import { type ConfigType } from '@src/common/config';

@injectable()
export class PostUploadWorker extends BullWorkerProvider<ChangesetUploadData, void> {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.METRICS) metricsRegistry: Registry,
    @inject(SERVICES.CONFIG) config: ConfigType,
    @inject(SERVICES.BULLMQ_WORKER_CONNECTION) connection: ioRedis,
    @inject(SERVICES.OSM_ID_RESOLVER) private readonly osmIdResolver: IOsmIdResolver,
    @inject(CLIENTS.CHANGE_MERGER) private readonly changeMerger: IChangeMerger,
    @inject(CLIENTS.ID_TO_OSM) private readonly idToOsm: IIdToOsm,
    @inject(CLIENTS.OSM_SYNC_TRACKER) private readonly tracker: IOsmSyncTracker
  ) {
    const workerLogger = logger.child({ component: WorkerEnum.CHANGESET_POST_UPLOAD });
    const workerOptions = config.get(`app.${QueueIdentifiers.CHANGESET_POST_UPLOAD}.workerOptions`) as unknown as WorkerOptions;
    const prefix = config.get('bullmq.keyPrefix');
    super({ logger: workerLogger, metricsRegistry, connection, workerOptions: { ...workerOptions, prefix } });

    this.logger.info({ msg: `initializing ${this.queueName} queue worker`, queueName: this.queueName, workerOptions: this.workerOptions });
  }

  protected getQueueName(): QueueEnum {
    return QueueEnum.CHANGESET_POST_UPLOAD;
  }

  protected async processJob(job: Job<ChangesetUploadData>): Promise<void> {
    const { changesetId } = job.data;

    this.logger.info({ msg: 'started job processing', queueName: this.queueName, jobId: job.id, jobName: job.name, changesetId });

    const changesetOsmId = await this.osmIdResolver.resolve(job);

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
