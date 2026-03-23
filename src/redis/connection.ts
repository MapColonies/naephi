import { readFileSync } from 'fs';
import ioRedis, { RedisOptions } from 'ioredis';
import { FactoryFunction } from 'tsyringe';
import { CleanupRegistry } from '@map-colonies/cleanup-registry';
import { ConfigType } from '@src/common/config';
import { SERVICES } from '@src/common/constants';
import { ExtendedRedisOptions } from '../common/interfaces';

const RETRY_CONNECTION_DELAY = 1000;

const CONNECTION_CLOSED_ERROR_MESSAGE = 'Connection is closed.';

const isTestEnv = (): boolean => {
  return process.env.JEST_WORKER_ID !== undefined;
};

export const redisQuitSafely = async (redis: ioRedis): Promise<void> => {
  try {
    await redis.quit();
  } catch (err) {
    if ((err as Error).message === CONNECTION_CLOSED_ERROR_MESSAGE) {
      return;
    }
    throw err;
  }
};

export const constructConnectionOptions = (redisConfig: ExtendedRedisOptions): RedisOptions => {
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

export const createRedisFactory: FactoryFunction<unknown> = (container) => {
  const config = container.resolve<ConfigType>(SERVICES.CONFIG);
  const redisConfig = config.get('redis');
  const options = constructConnectionOptions(redisConfig!);
  const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);

  const redis = new ioRedis(options);

  cleanupRegistry.register({
    id: SERVICES.REDIS_CLIENT,
    func: async (): Promise<void> => {
      await redisQuitSafely(redis);
    },
  });

  return redis;
};
