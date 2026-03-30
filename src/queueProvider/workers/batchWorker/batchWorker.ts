import { Job, Worker } from 'bullmq';
import type { Registry } from 'prom-client';
import type { ILogger } from '@src/common/interfaces';
import { DEFAULT_BATCH_OPTIONS } from '@src/queueProvider/constants';
import { BatchOptions, BatchWorkerOptions } from '../../options';
import { BufferedJob } from './interfaces';

const DEFAULT_TIMEOUT_WINDOW_MULTIPLIER = 2;

export class BatchWorker<DataType = unknown, NameType extends string = string> extends Worker<DataType, void, NameType> {
  protected readonly logger: ILogger;
  protected readonly metricsRegistry: Registry | undefined;
  private buffer: BufferedJob<DataType, NameType>[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly batchOptions: BatchOptions;
  private readonly batchProcessingLockDuration: number;
  private readonly processor: (jobs: Job<DataType, void, NameType>[]) => Promise<void>;

  public constructor(name: string, processor: (jobs: Job<DataType, void, NameType>[]) => Promise<void>, options: BatchWorkerOptions) {
    const { logger, batch, ...workerOptions } = options;

    const batchOptions: BatchOptions = {
      ...DEFAULT_BATCH_OPTIONS,
      ...batch,
    };

    const batchProcessingLockDuration = Math.max(workerOptions.lockDuration ?? 0, batchOptions.timeout * DEFAULT_TIMEOUT_WINDOW_MULTIPLIER);

    super(
      name,
      async (job) => {
        return new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            this.buffer = this.buffer.filter((bufferedJob) => bufferedJob.job.id !== job.id);
            reject(new Error('Job timed out in local buffer'));
          }, workerOptions.lockDuration);

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

          if (this.buffer.length >= this.batchOptions.size) {
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
    this.logger.info({ msg: 'batch worker is closing', bufferSize: this.buffer.length, force });

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
      batchSize: batch.length,
      ...this.getBatchMetadata(),
    });
    try {
      // execute provided batch logic
      await this.processor(batch.map((bufferedJob) => bufferedJob.job));

      batch.forEach((bufferedJob) => {
        this.logger.info({
          msg: 'resolving job as completed',
          job: bufferedJob.job.id,
          batchSize: batch.length,
          ...this.getBatchMetadata(),
        });
        bufferedJob.resolve();
      });
    } catch (err) {
      this.logger.error({
        msg: 'batch worker processing failed to at least one job in the batch, failing all jobs in batch.',
        err,
        batchSize: batch.length,
        ...this.getBatchMetadata(),
      });

      batch.forEach((bufferedJob) => {
        this.logger.info({
          msg: 'rejecting job as failed',
          job: bufferedJob.job,
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
