import { Job, Worker } from 'bullmq';
import { Counter, Gauge, Histogram, type Registry } from 'prom-client';
import { snakeCase } from 'lodash';
import type { ILogger } from '@src/common/interfaces';
import { MS_IN_SECOND, SNAKED_SERVICE_NAME } from '@src/common/constants';
import { BatchOptions, BatchWorkerOptions } from '../../options';
import { BufferedJob, FlushTrigger } from './interfaces';
import {
  TIMEOUT_WINDOW_MULTIPLIER,
  DEFAULT_WORKER_LOCK_DURATION,
  WORST_CASE_PROCESSING_MULTIPLIER,
  DEFAULT_BATCH_OPTIONS,
  BATCH_SIZE_HISTOGRAM_METRIC_BUCKETS,
} from './constants';

export class BatchWorker<DataType = unknown, NameType extends string = string> extends Worker<DataType, void, NameType> {
  protected readonly logger: ILogger;
  protected readonly metricsRegistry: Registry | undefined;
  private buffer: BufferedJob<DataType, NameType>[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly batchOptions: Required<BatchOptions>;
  private readonly batchProcessingLockDuration: number;
  private readonly processor: (jobs: Job<DataType, void, NameType>[]) => Promise<void>;

  private readonly batchSizeHistogram?: Histogram;
  private readonly batchProcessingDurationHistogram?: Histogram;
  private readonly bufferSizeGauge?: Gauge;
  private readonly flushCounter?: Counter;

  public constructor(name: string, processor: (jobs: Job<DataType, void, NameType>[]) => Promise<void>, options: BatchWorkerOptions) {
    const { logger, metricsRegistry, batch, ...workerOptions } = options;

    const batchOptions: Required<BatchOptions> = {
      ...DEFAULT_BATCH_OPTIONS,
      ...batch,
    };

    // worst case: job waits full timeout in buffer + processor runs for full timeout duration
    const batchProcessingLockDuration = Math.max(
      workerOptions.lockDuration ?? DEFAULT_WORKER_LOCK_DURATION,
      batchOptions.timeout * WORST_CASE_PROCESSING_MULTIPLIER * TIMEOUT_WINDOW_MULTIPLIER
    );

    const bufferJobFn = async (job: Job<DataType, void, NameType>): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          this.buffer = this.buffer.filter((bufferedJob) => bufferedJob.job.id !== job.id);
          this.bufferSizeGauge?.set(this.buffer.length);
          reject(new Error('job timed out in local buffer'));
        }, batchProcessingLockDuration);

        this.buffer.push({
          job,
          resolve: () => {
            clearTimeout(timeoutId);
            resolve();
          },
          reject: (err: Error) => {
            clearTimeout(timeoutId);
            reject(err);
          },
        });

        this.bufferSizeGauge?.set(this.buffer.length);

        if (this.buffer.length >= batchOptions.size) {
          void this.flush('size');
        } else {
          this.startTimer();
        }
      });
    };

    super(name, bufferJobFn, {
      ...workerOptions,
      lockDuration: batchProcessingLockDuration,
    });

    this.logger = logger;
    this.metricsRegistry = metricsRegistry;
    this.batchOptions = batchOptions;
    this.batchProcessingLockDuration = batchProcessingLockDuration;
    this.processor = processor;

    if (metricsRegistry !== undefined) {
      this.batchSizeHistogram = new Histogram({
        name: `${SNAKED_SERVICE_NAME}_${snakeCase(name)}_batch_size`,
        help: 'Distribution of batch sizes at flush time',
        buckets: BATCH_SIZE_HISTOGRAM_METRIC_BUCKETS,
        registers: [metricsRegistry],
      });

      this.batchProcessingDurationHistogram = new Histogram({
        name: `${SNAKED_SERVICE_NAME}_${snakeCase(name)}_batch_processing_duration_seconds`,
        help: 'Duration of batch processing from flush to completion',
        registers: [metricsRegistry],
      });

      this.bufferSizeGauge = new Gauge({
        name: `${SNAKED_SERVICE_NAME}_${snakeCase(name)}_buffer_size`,
        help: 'Current number of jobs waiting in the batch buffer',
        registers: [metricsRegistry],
      });

      this.flushCounter = new Counter({
        name: `${SNAKED_SERVICE_NAME}_${snakeCase(name)}_batch_flush_total`,
        help: 'Total number of batch flushes by trigger type',
        labelNames: ['trigger'] as const,
        registers: [metricsRegistry],
      });
    }
  }

  public override async close(force?: boolean): Promise<void> {
    this.logger.info({ msg: 'batch worker is closing', bufferSize: this.buffer.length, force, ...this.getBatchMetadata() });

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length > 0) {
      try {
        await this.flush('forced');
      } catch (err) {
        this.logger.error({
          msg: 'failed to flush buffer during shutdown',
          err,
          force,
          ...this.getBatchMetadata(),
        });
      }
    }

    await super.close(force);
  }

  private startTimer(): void {
    this.timer ??= setTimeout(() => {
      void this.flush('timer');
    }, this.batchOptions.timeout);
  }

  private async flush(trigger: FlushTrigger): Promise<void> {
    const force = trigger === 'forced';

    this.logger.debug({
      msg: 'batch worker flush is fired',
      trigger,
      ...this.getBatchMetadata(),
    });

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length === 0) return;

    // check if we meet the minimum requirement to flush on timeout
    if (!force && this.buffer.length < this.batchOptions.minSize) {
      // if not enough jobs, restart timer and keep waiting
      this.startTimer();
      return;
    }

    // snapshot the buffer and clear it to prevent race conditions during async processing
    const batch = [...this.buffer];
    this.buffer = [];

    this.bufferSizeGauge?.set(0);
    this.flushCounter?.inc({ trigger });
    this.batchSizeHistogram?.observe(batch.length);

    this.logger.info({
      msg: 'initializing batch processing',
      trigger,
      batchSize: batch.length,
      ...this.getBatchMetadata(),
    });

    const flushStart = Date.now();

    try {
      await this.processor(batch.map((bufferedJob) => bufferedJob.job));

      this.batchProcessingDurationHistogram?.observe((Date.now() - flushStart) / MS_IN_SECOND);

      batch.forEach((bufferedJob) => {
        this.logger.info({
          msg: 'resolving job as completed',
          trigger,
          jobId: bufferedJob.job.id,
          batchSize: batch.length,
          ...this.getBatchMetadata(),
        });
        bufferedJob.resolve();
      });
    } catch (err) {
      this.batchProcessingDurationHistogram?.observe((Date.now() - flushStart) / MS_IN_SECOND);

      this.logger.error({
        msg: 'batch processing failed, failing all jobs in batch',
        trigger,
        err,
        batchSize: batch.length,
        ...this.getBatchMetadata(),
      });

      batch.forEach((bufferedJob) => {
        this.logger.info({
          msg: 'rejecting job as failed',
          trigger,
          jobId: bufferedJob.job.id,
          batchSize: batch.length,
          ...this.getBatchMetadata(),
        });
        bufferedJob.reject(err as Error);
      });
    }
  }

  private getBatchMetadata(): Record<string, unknown> {
    return {
      batchOptions: this.batchOptions,
      currentBufferSize: this.buffer.length,
      batchProcessingLockDuration: this.batchProcessingLockDuration,
    };
  }
}
