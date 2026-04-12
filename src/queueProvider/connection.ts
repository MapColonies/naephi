import { FactoryFunction } from 'tsyringe';
import ioRedis, { RedisOptions } from 'ioredis';
import { CleanupRegistry } from '@map-colonies/cleanup-registry';
import { constructConnectionOptions, redisQuitSafely } from '@src/redis/connection';
import { ConfigType } from '../common/config';
import { SERVICES } from '../common/constants';
import { CONSTANT_BULLMQ_QUEUE_CONNECTION_OPTIONS, CONSTANT_BULLMQ_WORKER_CONNECTION_OPTIONS, BULLMQ_CONNECTION_OPTIONS_SYMBOL } from './constants';

export const createBullMqConnectionOptionsFactory: FactoryFunction<RedisOptions> = (container) => {
  const config = container.resolve<ConfigType>(SERVICES.CONFIG);
  const bullMqConfig = config.get('bullmq');
  return constructConnectionOptions(bullMqConfig!);
};

export const createReusableRedisWorkerConnectionFactory: FactoryFunction<ioRedis> = (container) => {
  const connectionOptions = container.resolve<RedisOptions>(BULLMQ_CONNECTION_OPTIONS_SYMBOL);
  const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);

  const redis = new ioRedis({ ...connectionOptions, ...CONSTANT_BULLMQ_WORKER_CONNECTION_OPTIONS });

  cleanupRegistry.register({
    id: SERVICES.BULLMQ_WORKER_CONNECTION,
    func: async (): Promise<void> => {
      await redisQuitSafely(redis);
    },
  });

  return redis;
};

export const createReusableRedisQueueConnectionFactory: FactoryFunction<ioRedis> = (container) => {
  const connectionOptions = container.resolve<RedisOptions>(BULLMQ_CONNECTION_OPTIONS_SYMBOL);
  const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);

  const redis = new ioRedis({ ...connectionOptions, ...CONSTANT_BULLMQ_QUEUE_CONNECTION_OPTIONS });

  cleanupRegistry.register({
    id: SERVICES.BULLMQ_QUEUE_CONNECTION,
    func: async (): Promise<void> => {
      await redisQuitSafely(redis);
    },
  });

  return redis;
};
