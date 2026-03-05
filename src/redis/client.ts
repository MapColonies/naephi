import { Redis } from 'ioredis';
import { Counter, Registry } from 'prom-client';
import { inject, injectable } from 'tsyringe';
import type { ILogger } from '@src/common/interfaces';
import { SERVICE_NAME, SERVICES } from '@src/common/constants';

@injectable()
export class RedisClient {
  private readonly commandsCounter?: Counter;

  public constructor(
    @inject(SERVICES.REDIS_CLIENT) private readonly client: Redis,
    @inject(SERVICES.LOGGER) private readonly logger?: ILogger,
    @inject(SERVICES.METRICS) metricsRegistry?: Registry
  ) {
    if (metricsRegistry !== undefined) {
      this.commandsCounter = new Counter({
        name: `${SERVICE_NAME}_redis_commands_total`,
        help: 'Total number of executed redis commands',
        labelNames: ['command', 'status'],
        registers: [metricsRegistry],
      });
    }
  }

  public async get<T>(key: string): Promise<T | null> {
    this.logger?.info({ msg: 'executing redis get command', key });

    try {
      const value = await this.client.get(key);

      if (value === null) {
        this.commandsCounter?.inc({ command: 'get', status: 'not_found' });
        return null;
      }

      const parsedValue = JSON.parse(value) as T;

      this.commandsCounter?.inc({ command: 'get', status: 'success' });
      return parsedValue;
    } catch (error) {
      this.commandsCounter?.inc({ command: 'get', status: 'failed' });
      this.logger?.error({ msg: 'failed to get/parse key from redis', key, err: error });
      throw error;
    }
  }

  public async delete(key: string): Promise<void> {
    this.logger?.info({ msg: 'executing redis del command', key });

    try {
      await this.client.del(key);
      this.commandsCounter?.inc({ command: 'delete', status: 'success' });
    } catch (error) {
      this.commandsCounter?.inc({ command: 'delete', status: 'failed' });
      this.logger?.error({ msg: 'failed to delete key from redis', key, err: error });
      throw error;
    }
  }

  public async deleteBatch(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    this.logger?.info({ msg: 'executing redis batch del command', count: keys.length, keys });

    try {
      await this.client.del(...keys);

      this.commandsCounter?.inc({ command: 'delete', status: 'success' }, keys.length);
    } catch (error) {
      this.commandsCounter?.inc({ command: 'delete', status: 'failed' }, keys.length);
      this.logger?.error({
        msg: 'failed to batch delete from redis',
        count: keys.length,
        keys,
        err: error,
      });
      throw error;
    }
  }
}
