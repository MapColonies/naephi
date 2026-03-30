import { Redis } from 'ioredis';
import { Counter, Histogram, Registry } from 'prom-client';
import { inject, injectable, singleton } from 'tsyringe';
import type { ILogger } from '@src/common/interfaces';
import { SNAKED_SERVICE_NAME, SERVICES } from '@src/common/constants';
import { IRedisClient } from './interfaces';

@singleton()
@injectable()
export class RedisClient implements IRedisClient {
  private readonly commandsCounter?: Counter;
  private readonly commandsDurationHistogram?: Histogram;

  public constructor(
    @inject(SERVICES.REDIS) private readonly redis: Redis,
    @inject(SERVICES.LOGGER) private readonly logger?: ILogger,
    @inject(SERVICES.METRICS) metricsRegistry?: Registry
  ) {
    if (metricsRegistry !== undefined) {
      this.commandsCounter = new Counter({
        name: `${SNAKED_SERVICE_NAME}_redis_commands_total`,
        help: 'Total number of executed redis commands',
        labelNames: ['command', 'status'],
        registers: [metricsRegistry],
      });

      this.commandsDurationHistogram = new Histogram({
        name: `${SNAKED_SERVICE_NAME}_redis_command_duration_seconds`,
        help: 'Execution time of redis commands in seconds',
        labelNames: ['command'],
        registers: [metricsRegistry],
      });
    }
  }

  public async get<T>(key: string): Promise<T | null> {
    this.logger?.info({ msg: 'executing redis get command', key });
    const stopTimer = this.commandsDurationHistogram?.startTimer({ command: 'get' });

    try {
      const value = await this.redis.get(key);

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
    } finally {
      stopTimer?.();
    }
  }

  public async delete(key: string): Promise<void> {
    this.logger?.info({ msg: 'executing redis del command', key });
    const stopTimer = this.commandsDurationHistogram?.startTimer({ command: 'delete' });

    try {
      await this.redis.del(key);
      this.commandsCounter?.inc({ command: 'delete', status: 'success' });
    } catch (error) {
      this.commandsCounter?.inc({ command: 'delete', status: 'failed' });
      this.logger?.error({ msg: 'failed to delete key from redis', key, err: error });
      throw error;
    } finally {
      stopTimer?.();
    }
  }

  public async deleteBatch(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    this.logger?.info({ msg: 'executing redis batch del command', count: keys.length, keys });
    const stopTimer = this.commandsDurationHistogram?.startTimer({ command: 'delete_batch' });

    try {
      await this.redis.del(...keys);
      this.commandsCounter?.inc({ command: 'delete_batch', status: 'success' }, keys.length);
    } catch (error) {
      this.commandsCounter?.inc({ command: 'delete_batch', status: 'failed' }, keys.length);
      this.logger?.error({ msg: 'failed to batch delete from redis', count: keys.length, keys, err: error });
      throw error;
    } finally {
      stopTimer?.();
    }
  }

  public async ping(): Promise<boolean> {
    this.logger?.debug({ msg: 'executing redis ping command' });
    const stopTimer = this.commandsDurationHistogram?.startTimer({ command: 'ping' });

    try {
      await this.redis.ping();

      this.commandsCounter?.inc({ command: 'ping', status: 'success' });
      return true;
    } catch (error) {
      this.commandsCounter?.inc({ command: 'ping', status: 'failed' });
      this.logger?.error({ msg: 'failed to ping redis', err: error });
      throw error;
    } finally {
      stopTimer?.();
    }
  }
}
