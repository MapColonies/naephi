import { FlowProducer, Queue, WorkerOptions } from 'bullmq';
import ioRedis from 'ioredis';
import { Registry } from 'prom-client';
import { ILogger } from '@src/common/interfaces';

export interface BaseOptions {
  logger: ILogger;
  metricsRegistry?: Registry;
}

export interface QueueOptions extends BaseOptions {
  queue: Queue;
  queueName: string;
}

export interface FlowProducerOptions extends BaseOptions {
  flow: FlowProducer;
}

export interface WorkerProviderOptions extends BaseOptions {
  workerOptions: WorkerOptions;
  connection: ioRedis;
}

export interface BatchOptions {
  size: number; // Max size to force an immediate flush
  minSize: number; // Minimum jobs required to flush when the timer hits
  timeout: number; // Time in ms to wait before attempting a flush
}

export interface BatchWorkerOptions extends WorkerOptions {
  // TODO: extend BaseOptions
  batch?: Partial<BatchOptions>;
}

export interface BatchWorkerProviderOptions extends WorkerProviderOptions {
  batch?: Partial<BatchOptions>;
}
