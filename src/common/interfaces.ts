import { QueueOptions, WorkerOptions } from 'bullmq';
import { RedisOptions } from 'ioredis';
import { Client } from '@src/clients/constants';
import { ClientOptions } from '@src/clients/options';
import { QueueId } from '@src/queueProvider/constants';

interface LogFn {
  (obj: unknown, msg?: string, ...args: unknown[]): void;
  (msg: string, ...args: unknown[]): void;
}

export interface IConfig {
  get: <T>(setting: string) => T;
  has: (setting: string) => boolean;
}

export interface ILogger {
  trace?: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal?: LogFn;
}

export type ExtendedRedisOptions = {
  host: string;
  port: number;
  enableSslAuth: boolean;
  sslPaths: { ca: string; cert: string; key: string };
} & RedisOptions;

export interface AppConfig {
  uiPath: string;
  osmIdResolver: 'tracker' | 'childJob';
  workerOptions: WorkerOptions;
  queues: {
    [key in QueueId]: QueueOptions;
  };
  clients: {
    [key in Client]: ClientOptions;
  };
}
