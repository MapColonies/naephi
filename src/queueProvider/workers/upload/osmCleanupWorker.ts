import ioRedis from 'ioredis';
import { injectable, inject } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { Job } from 'bullmq';
import { type AppConfig } from '@src/common/interfaces';
import { SERVICES } from '@src/common/constants';
import type { IOsmAPI } from '@src/clients/osmAPI/types';
import { ChangesetCloseConflictError, ChangesetNotFoundError } from '@src/clients/osmAPI/errors';
import { QueueEnum, WorkerEnum } from '../../constants';
import { BullBatchWorkerProvider } from '../bullBatchWorkerProvider';
import { CompleteChangesetIdentifiers } from './types';

@injectable()
export class OsmCleanupWorker extends BullBatchWorkerProvider<CompleteChangesetIdentifiers> {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.METRICS) metricsRegistry: Registry,
    @inject(SERVICES.APP_CONFIG) appConfig: AppConfig,
    @inject(SERVICES.REDIS_WORKER_CONNECTION) connection: ioRedis,
    @inject(SERVICES.OSM_API_CLIENT) private readonly osmApi: IOsmAPI
  ) {
    const workerLogger = logger.child({ component: WorkerEnum.CHANGESET_OSM_CLEANUP });
    const { workerOptions } = appConfig;
    super({ logger: workerLogger, metricsRegistry, connection, workerOptions });

    this.logger.info({ msg: `initializing ${this.queueName} queue worker`, queueName: this.queueName, workerOptions: this.workerOptions });
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
