import { readFileSync } from 'fs';
import { FactoryFunction } from 'tsyringe';
import ioRedis, { RedisOptions } from 'ioredis';
import { CleanupRegistry } from '@map-colonies/cleanup-registry';
import { ConfigType } from '../common/config';
import { SERVICES } from '../common/constants';
import { RedisConfig } from '../common/interfaces';
import { CONSTANT_BULLMQ_QUEUE_CONNECTION_OPTIONS, CONSTANT_BULLMQ_WORKER_CONNECTION_OPTIONS, REDIS_CONNECTION_OPTIONS_SYMBOL } from './constants';

const RETRY_CONNECTION_DELAY = 1000;

const CONNECTION_CLOSED_ERROR_MESSAGE = 'Connection is closed.';

const isTestEnv = (): boolean => {
  return process.env.JEST_WORKER_ID !== undefined;
};

const redisQuitSafely = async (redis: ioRedis): Promise<void> => {
  try {
    await redis.quit();
  } catch (err) {
    if ((err as Error).message === CONNECTION_CLOSED_ERROR_MESSAGE) {
      return;
    }
    throw err;
  }
};

export const constructConnectionOptions = (redisConfig: RedisConfig): RedisOptions => {
  const { host, port, enableSslAuth, sslPaths, ...clientOptions } = redisConfig;

  const connectionOptions: RedisOptions = {
    host,
    port,
    ...clientOptions,
    retryStrategy: () => {
      if (isTestEnv()) {
        return null;
      }

      return RETRY_CONNECTION_DELAY;
    },
  };

  if (enableSslAuth) {
    connectionOptions.tls = {
      host,
      port,
      key: sslPaths.key ? readFileSync(sslPaths.key) : undefined,
      cert: sslPaths.cert ? readFileSync(sslPaths.cert) : undefined,
      ca: sslPaths.ca ? readFileSync(sslPaths.ca) : undefined,
    };
  }

  return connectionOptions;
};

export const createConnectionOptionsFactory: FactoryFunction<RedisOptions> = (container) => {
  const config = container.resolve<ConfigType>(SERVICES.CONFIG);
  const redisConfig = config.get('redis') as RedisConfig;
  return constructConnectionOptions(redisConfig);
};

export const createReusableRedisWorkerConnectionFactory: FactoryFunction<ioRedis> = (container) => {
  const connectionOptions = container.resolve<RedisOptions>(REDIS_CONNECTION_OPTIONS_SYMBOL);
  const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);

  const redis = new ioRedis({ ...connectionOptions, ...CONSTANT_BULLMQ_WORKER_CONNECTION_OPTIONS });

  cleanupRegistry.register({
    id: SERVICES.REDIS_WORKER_CONNECTION,
    func: async (): Promise<void> => {
      await redisQuitSafely(redis);
    },
  });

  return redis;
};

export const createReusableRedisQueueConnectionFactory: FactoryFunction<ioRedis> = (container) => {
  const connectionOptions = container.resolve<RedisOptions>(REDIS_CONNECTION_OPTIONS_SYMBOL);
  const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);

  const redis = new ioRedis({ ...connectionOptions, ...CONSTANT_BULLMQ_QUEUE_CONNECTION_OPTIONS });

  cleanupRegistry.register({
    id: SERVICES.REDIS_QUEUE_CONNECTION,
    func: async (): Promise<void> => {
      await redisQuitSafely(redis);
    },
  });

  return redis;
};
