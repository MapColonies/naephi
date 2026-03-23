import ioRedis from 'ioredis';
import { injectable, inject } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { Job } from 'bullmq';
import type { IOsmSyncTracker } from '@src/clients/osmSyncTracker/types';
import { SERVICES } from '@src/common/constants';
import { CLIENTS } from '@src/clients/constants';
import type { ConfigType } from '@src/common/config';
import { QueueConfiguration } from '@src/queueProvider/options';
import { QueueEnum, QueueIdentifiers, WorkerEnum } from '../../constants';
import { BullBatchWorkerProvider } from '../batchWorker/bullBatchWorkerProvider';
import { ChangesetUploadData } from './types';

@injectable()
export class ClosureWorker extends BullBatchWorkerProvider<ChangesetUploadData> {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.METRICS) metricsRegistry: Registry,
    @inject(SERVICES.CONFIG) config: ConfigType,
    @inject(SERVICES.BULLMQ_WORKER_CONNECTION) connection: ioRedis,
    @inject(CLIENTS.OSM_SYNC_TRACKER) private readonly tracker: IOsmSyncTracker
  ) {
    const workerLogger = logger.child({ component: WorkerEnum.CHANGESET_CLOSURE });
    const { workerOptions, batchOptions: batch } = config.get(`app.queues.${QueueIdentifiers.CHANGESET_CLOSURE}`) as unknown as QueueConfiguration;
    const prefix = config.get('bullmq.keyPrefix');

    super({ logger: workerLogger, metricsRegistry, connection, batch, workerOptions: { ...workerOptions, prefix } });

    this.logger.info({ msg: `initializing ${this.queueName} queue worker`, queueName: this.queueName, workerOptions: this.workerOptions });
  }

  protected getQueueName(): QueueEnum {
    return QueueEnum.CHANGESET_CLOSURE;
  }

  protected async processBatch(jobs: Job<ChangesetUploadData>[]): Promise<void> {
    const changesetIds = jobs.map((job) => job.data.changesetId);

    this.logger.info({ msg: 'started batch jobs processing', queueName: this.queueName, batchSize: jobs.length, changesetIds });

    // osm-sync-tracker::POST /changeset/closure
    await this.tracker.postChangesetClosureJobs(changesetIds);
  }
}
