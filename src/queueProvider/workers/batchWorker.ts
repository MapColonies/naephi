import { Job, Worker } from 'bullmq';
import { BatchOptions, BatchWorkerOptions } from '../options';

export class BatchWorker<DataType = unknown, NameType extends string = string> extends Worker<DataType, void, NameType> {
  private buffer: Job<DataType, void, NameType>[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly batchOptions: BatchOptions;
  private readonly processor: (jobs: Job<DataType, void, NameType>[]) => Promise<void>;

  public constructor(name: string, processor: (jobs: Job<DataType, void, NameType>[]) => Promise<void>, options: BatchWorkerOptions) {
    const { batch, ...workerOptions } = options;

    const batchOptions: BatchOptions = {
      size: batch?.size ?? 10,
      minSize: batch?.minSize ?? 1,
      timeout: batch?.timeout ?? 5000,
    };

    super(
      name,
      async (job) => {
        this.buffer.push(job);

        if (this.buffer.length >= this.batchOptions.size) {
          await this.flush();
        } else {
          this.startTimer();
        }
      },
      {
        ...workerOptions,
        // Ensure lockDuration is long enough to cover the batching window
        lockDuration: Math.max(
          30000, // TODO: make configurable
          batchOptions.timeout * 2
        ),
      }
    );

    this.batchOptions = batchOptions;
    this.processor = processor;

    // Remove jobs from local buffer if they are stalled/reclaimed by another worker
    this.on('stalled', (jobId) => {
      this.buffer = this.buffer.filter((job) => job.id !== jobId);
    });
  }

  public override async close(force?: boolean): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await super.close(force);
  }

  /**
   * Starts or maintains the timeout timer for the current batch.
   */
  private startTimer(): void {
    this.timer ??= setTimeout(() => {
      void this.flush();
    }, this.batchOptions.timeout);
  }

  private async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length === 0) return;

    // Check if we meet the minimum requirement to flush on timeout
    if (this.buffer.length < this.batchOptions.minSize) {
      // If not enough jobs, restart timer and keep waiting
      this.startTimer();
      return;
    }

    // Snapshot the buffer and clear it to prevent race conditions during async processing
    const jobsToProcess = [...this.buffer];
    this.buffer = [];

    try {
      // Execute the user-provided batch logic
      await this.processor(jobsToProcess);

      // Manually complete all jobs in the batch
      await Promise.all(jobsToProcess.map(async (job) => job.moveToCompleted(undefined, job.token!)));
    } catch (err) {
      console.error('BatchWorker: Processing failed, failing all jobs in batch.', err);

      // Move all jobs to failed state if the batch processor throws
      await Promise.all(jobsToProcess.map(async (job) => job.moveToFailed(err as Error, job.token!)));
    }
  }
}
