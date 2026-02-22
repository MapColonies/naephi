import { Counter, Histogram, Registry } from 'prom-client';
import { Job, Worker, WorkerOptions } from 'bullmq';
import ioRedis from 'ioredis';
import { snakeCase } from 'change-case';
import { MS_IN_SECOND } from '@src/common/constants';
import { ILogger } from '@src/common/interfaces';
import { WorkerProviderOptions } from '../options';
import { QueueEnum, QUEUE_KEY_PREFIX } from '../constants';
import { bullMqOtelFactory } from '../telemetry';

export abstract class BullWorkerProvider<DataType = unknown, ReturnType = unknown> {
  protected readonly logger: ILogger;
  protected readonly metricsRegistry: Registry | undefined;
  protected readonly workerOptions: WorkerOptions;
  protected worker: Worker<DataType, ReturnType> | undefined;
  protected readonly connection: ioRedis;

  private readonly jobCounter?: Counter<'status'>;
  private readonly internalErrorCounter?: Counter;
  private readonly porcessingHistogram?: Histogram;

  public constructor(options: WorkerProviderOptions) {
    const { logger, metricsRegistry, connection, workerOptions } = options;
    this.logger = logger;
    this.metricsRegistry = metricsRegistry;
    this.workerOptions = workerOptions;
    this.connection = connection;

    if (this.metricsRegistry !== undefined) {
      this.porcessingHistogram = new Histogram({
        name: `naephi_${snakeCase(this.queueName)}_job_processing_duration_seconds`,
        help: 'Naephi processing duration',
        registers: [this.metricsRegistry],
      });

      this.jobCounter = new Counter({
        name: `naephi_${snakeCase(this.queueName)}_job_count`,
        help: 'Naephi job processing counter by resulted event',
        labelNames: ['status'] as const,
        registers: [this.metricsRegistry],
      });

      this.internalErrorCounter = new Counter({
        name: `naephi_${snakeCase(this.queueName)}_internal_error_total`,
        help: 'The total number of internal errors occured while job processing',
        registers: [this.metricsRegistry],
      });
    }
  }

  public get queueName(): string {
    return this.getQueueName();
  }

  public async start(): Promise<void> {
    if (!this.worker) {
      this.createWorker();
    }

    try {
      await this.worker?.run();
      this.logger.info({ msg: 'worker started consuming successfully', queueName: this.queueName });
    } catch (err) {
      this.logger.error({ msg: 'failed to start worker', queueName: this.queueName, err });
      throw err;
    }
  }

  public async close(): Promise<void> {
    if (!this.worker) {
      return;
    }

    try {
      await this.worker.close();
      this.logger.info({ msg: `worker closed gracefully`, queueName: this.queueName });
    } catch (err) {
      this.logger.error({ msg: `failed closing worker`, queueName: this.queueName, err });
      throw err;
    } finally {
      this.worker = undefined;
    }
  }

  protected setupEventListenerts(): void {
    this.worker?.on('completed', (job) => {
      const { id, name, finishedOn, processedOn } = job;
      this.logger.debug({ msg: `job completed`, queueName: this.queueName, jobId: id, jobName: name });

      this.jobCounter?.inc({ status: 'completed' });

      if (finishedOn !== undefined && processedOn !== undefined) {
        const duration = (finishedOn - processedOn) / MS_IN_SECOND;
        this.porcessingHistogram?.observe(duration);
      }
    });

    this.worker?.on('failed', (job, err) => {
      const attempts = job?.opts.attempts;
      const attemptsMade = job?.attemptsMade;

      this.logger.error({ msg: `job failed`, queueName: this.queueName, jobId: job?.id, jobName: job?.name, err, attempts, attemptsMade });

      if (attempts !== undefined && attemptsMade !== undefined && attempts > attemptsMade) {
        this.jobCounter?.inc({ status: 'retry' });
      } else {
        this.jobCounter?.inc({ status: 'failed' });
      }
    });

    this.worker?.on('stalled', (jobId) => {
      this.logger.warn({ msg: 'job stalled', queueName: this.queueName, jobId });
      this.jobCounter?.inc({ status: 'stalled' });
    });

    this.worker?.on('error', (err) => {
      this.logger.error({ msg: 'worker internal error occured', queueName: this.queueName, err });
      this.internalErrorCounter?.inc();
    });
  }

  protected createWorker(): void {
    const workerConstructorOptions = {
      ...this.workerOptions,
      connection: this.connection,
      prefix: QUEUE_KEY_PREFIX,
      autorun: false,
      telemetry: bullMqOtelFactory(),
    };

    this.worker = new Worker(this.queueName, this.processJob.bind(this), workerConstructorOptions);

    this.setupEventListenerts();
  }

  protected abstract processJob(job: Job<DataType, ReturnType>): Promise<ReturnType>;

  protected abstract getQueueName(): QueueEnum;
}
