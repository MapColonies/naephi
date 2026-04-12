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
  size?: number;
  minSize?: number;
  timeout?: number;
  lockDuration: number;
}

export interface BatchWorkerOptions extends WorkerOptions, BaseOptions {
  batch?: BatchOptions;
}

export interface BatchWorkerProviderOptions extends WorkerProviderOptions {
  batch?: BatchOptions;
}

export interface QueueConfiguration {
  jobOptions: JobsOptions;
  workerOptions: WorkerOptions;
  batchOptions?: BatchOptions;
}
