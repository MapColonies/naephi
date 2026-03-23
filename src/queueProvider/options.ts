import { FlowProducer, JobsOptions, Queue, WorkerOptions } from 'bullmq';
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
  /** Maximum batch size that triggers an immediate flush, bypassing the timer. */
  size: number;
  /** Minimum number of jobs required to flush when the timer fires. */
  minSize: number;
  /** Duration in milliseconds to wait before attempting a flush. */
  timeout: number;
}

export interface BatchWorkerOptions extends WorkerOptions {
  batch?: Partial<BatchOptions>;
}

export interface BatchWorkerProviderOptions extends WorkerProviderOptions {
  batch?: Partial<BatchOptions>;
}

export interface QueueOptions {
  jobOptions: JobsOptions;
  workerOptions: WorkerOptions;
  batchOptions?: BatchOptions;
}
