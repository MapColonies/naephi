import ioRedis from 'ioredis';
import { injectable, inject } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { Job } from 'bullmq';
import { SERVICES } from '@src/common/constants';
import { RedisClient } from '@src/redis/client';
import type { ConfigType } from '@src/common/config';
import { QueueConfiguration } from '@src/queueProvider/options';
import { QueueEnum, QueueIdentifiers, WorkerEnum } from '../../constants';
import { BullBatchWorkerProvider } from '../batchWorker/bullBatchWorkerProvider';
import { CompleteChangesetIdentifiers } from './types';

@injectable()
export class RedisCleanupWorker extends BullBatchWorkerProvider<CompleteChangesetIdentifiers> {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.METRICS) metricsRegistry: Registry,
    @inject(SERVICES.CONFIG) config: ConfigType,
    @inject(SERVICES.BULLMQ_WORKER_CONNECTION) connection: ioRedis,
    @inject(RedisClient) private readonly redis: RedisClient
  ) {
    const workerLogger = logger.child({ component: WorkerEnum.CHANGESET_REDIS_CLEANUP });
    const { workerOptions, batchOptions: batch } = config.get(
      `app.queues.${QueueIdentifiers.CHANGESET_REDIS_CLEANUP}`
    ) as unknown as QueueConfiguration;
    const prefix = config.get('bullmq.keyPrefix');

    super({ logger: workerLogger, metricsRegistry, connection, batch, workerOptions: { ...workerOptions, prefix } });

    this.logger.info({ msg: `initializing ${this.queueName} queue worker`, queueName: this.queueName, workerOptions: this.workerOptions });
  }

  protected getQueueName(): QueueEnum {
    return QueueEnum.CHANGESET_REDIS_CLEANUP;
  }

  protected async processBatch(jobs: Job<CompleteChangesetIdentifiers>[]): Promise<void> {
    const changesetIds = jobs.map((job) => job.data.changesetId);

    this.logger.info({ msg: 'started batch jobs processing', queueName: this.queueName, batchSize: jobs.length, changesets: jobs.map((job) => job) });

    // redis::DEL {...changesetIds}
    await this.redis.deleteBatch(changesetIds);
  }
}
