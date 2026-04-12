import ioRedis from 'ioredis';
import { injectable, inject } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { Job } from 'bullmq';
import { SERVICES } from '@src/common/constants';
import type { IOsmAPI } from '@src/clients/osmAPI/types';
import { ChangesetCloseConflictError, ChangesetNotFoundError } from '@src/clients/osmAPI/errors';
import { CLIENTS } from '@src/clients/constants';
import { QueueConfiguration } from '@src/queueProvider/options';
import type { ConfigType } from '@src/common/config';
import { QueueEnum, QueueIdentifiers, WorkerEnum } from '../../constants';
import { BullBatchWorkerProvider } from '../batchWorker/bullBatchWorkerProvider';
import { CompleteChangesetIdentifiers } from './types';

@injectable()
export class OsmCleanupWorker extends BullBatchWorkerProvider<CompleteChangesetIdentifiers> {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.METRICS) metricsRegistry: Registry,
    @inject(SERVICES.CONFIG) config: ConfigType,
    @inject(SERVICES.BULLMQ_WORKER_CONNECTION) connection: ioRedis,
    @inject(CLIENTS.OSM_API) private readonly osmApi: IOsmAPI
  ) {
    const workerLogger = logger.child({ component: WorkerEnum.CHANGESET_OSM_CLEANUP });
    const { workerOptions, batchOptions: batch } = config.get(
      `app.queues.${QueueIdentifiers.CHANGESET_OSM_CLEANUP}`
    ) as unknown as QueueConfiguration;
    const prefix = config.get('bullmq.keyPrefix');

    super({ logger: workerLogger, metricsRegistry, connection, batch, workerOptions: { ...workerOptions, prefix } });
  }

  protected getQueueName(): QueueEnum {
    return QueueEnum.CHANGESET_OSM_CLEANUP;
  }

  protected async processBatch(jobs: Job<CompleteChangesetIdentifiers>[]): Promise<void> {
    const changesetOsmIds = jobs.map((job) => job.data.osmId);

    this.logger.info({ msg: 'started batch jobs processing', queueName: this.queueName, batchSize: jobs.length, changesets: jobs.map((job) => job) });

    // osm-api::PUT /changeset/{changesetId}/close
    await Promise.allSettled(
      changesetOsmIds.map(async (osmId) => {
        try {
          await this.osmApi.closeChangeset(osmId);
        } catch (error) {
          if (error instanceof ChangesetCloseConflictError) {
            this.logger.info({ msg: 'changeset is already closed on OSM', osmId });
          } else if (error instanceof ChangesetNotFoundError) {
            this.logger.error({ msg: 'changeset not found on OSM', osmId });
          } else {
            this.logger.warn({
              msg: 'changeset close call failed; relying on auto-closure',
              osmId,
              err: error,
            });
          }
        }
      })
    );
  }
}
