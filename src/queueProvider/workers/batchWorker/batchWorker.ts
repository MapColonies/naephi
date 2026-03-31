import { Job, Worker } from 'bullmq';
import type { Registry } from 'prom-client';
import type { ILogger } from '@src/common/interfaces';
import { BatchOptions, BatchWorkerOptions } from '../../options';
import { BufferedJob } from './interfaces';
import { TIMEOUT_WINDOW_MULTIPLIER, DEFAULT_WORKER_LOCK_DURATION, WORST_CASE_PROCESSING_MULTIPLIER, DEFAULT_BATCH_OPTIONS } from './constants';

export class BatchWorker<DataType = unknown, NameType extends string = string> extends Worker<DataType, void, NameType> {
  protected readonly logger: ILogger;
  protected readonly metricsRegistry: Registry | undefined;
  private buffer: BufferedJob<DataType, NameType>[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly batchOptions: Required<BatchOptions>;
  private readonly batchProcessingLockDuration: number;
  private readonly processor: (jobs: Job<DataType, void, NameType>[]) => Promise<void>;

  public constructor(name: string, processor: (jobs: Job<DataType, void, NameType>[]) => Promise<void>, options: BatchWorkerOptions) {
    const { logger, batch, ...workerOptions } = options;

    const batchOptions: Required<BatchOptions> = {
      ...DEFAULT_BATCH_OPTIONS,
      ...batch,
    };

    // worst case: job waits full timeout in buffer + processor runs for full timeout duration
    const batchProcessingLockDuration = Math.max(
      workerOptions.lockDuration ?? DEFAULT_WORKER_LOCK_DURATION,
      batchOptions.timeout * WORST_CASE_PROCESSING_MULTIPLIER * TIMEOUT_WINDOW_MULTIPLIER
    );

    super(
      name,
      async (job) => {
        return new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            this.buffer = this.buffer.filter((bufferedJob) => bufferedJob.job.id !== job.id);
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

          if (this.buffer.length >= batchOptions.size) {
            void this.flush();
          } else {
            this.startTimer();
          }
        });
      },
      {
        ...workerOptions,
        lockDuration: batchProcessingLockDuration,
      }
    );

    this.logger = logger;
    this.batchOptions = batchOptions;
    this.batchProcessingLockDuration = batchProcessingLockDuration;
    this.processor = processor;
  }

  public override async close(force?: boolean): Promise<void> {
    this.logger.info({ msg: 'batch worker is closing', bufferSize: this.buffer.length, force, ...this.getBatchMetadata() });

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length > 0) {
      try {
        await this.flush(true);
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
      void this.flush();
    }, this.batchOptions.timeout);
  }

  private async flush(force = false): Promise<void> {
    this.logger.debug({
      msg: 'batch worker flush is fired',
      force,
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

    this.logger.info({
      msg: 'initializing batch processing',
      force,
      batchSize: batch.length,
      ...this.getBatchMetadata(),
    });

    try {
      await this.processor(batch.map((bufferedJob) => bufferedJob.job));

      batch.forEach((bufferedJob) => {
        this.logger.info({
          msg: 'resolving job as completed',
          force,
          jobId: bufferedJob.job.id,
          batchSize: batch.length,
          ...this.getBatchMetadata(),
        });
        bufferedJob.resolve();
      });
    } catch (err) {
      this.logger.error({
        msg: 'batch processing failed, failing all jobs in batch',
        force,
        err,
        batchSize: batch.length,
        ...this.getBatchMetadata(),
      });

      batch.forEach((bufferedJob) => {
        this.logger.info({
          msg: 'rejecting job as failed',
          force,
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
