import { Job, Worker } from 'bullmq';
import { BatchOptions, BatchWorkerOptions } from '../../options';
import { DEFAULT_BATCH_OPTIONS } from '@src/queueProvider/constants';

export class BatchWorker<DataType = unknown, NameType extends string = string> extends Worker<DataType, void, NameType> {
  private buffer: Job<DataType, void, NameType>[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly batchOptions: BatchOptions;
  private readonly processor: (jobs: Job<DataType, void, NameType>[]) => Promise<void>;

  public constructor(name: string, processor: (jobs: Job<DataType, void, NameType>[]) => Promise<void>, options: BatchWorkerOptions) {
    const { batch, ...workerOptions } = options;

    const batchOptions: BatchOptions = {
      ...DEFAULT_BATCH_OPTIONS,
      ...batch,
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
        // ensure the worker's lockDuration is long enough to cover the batching window
        lockDuration: Math.max(workerOptions.lockDuration ?? 0, batchOptions.timeout * 2),
      }
    );

    this.batchOptions = batchOptions;
    this.processor = processor;

    // remove jobs from local buffer if they are stalled/reclaimed by another worker
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

    // check if we meet the minimum requirement to flush on timeout
    if (this.buffer.length < this.batchOptions.minSize) {
      // if not enough jobs, restart timer and keep waiting
      this.startTimer();
      return;
    }

    // snapshot the buffer and clear it to prevent race conditions during async processing
    const jobsToProcess = [...this.buffer];
    this.buffer = [];

    try {
      // execute the user-provided batch logic
      await this.processor(jobsToProcess);

      // manually complete all jobs in the batch
      await Promise.all(jobsToProcess.map(async (job) => job.moveToCompleted(undefined, job.token!)));
    } catch (err) {
      console.error({
        msg: 'BatchWorker: processing failed to at least one job in the batch, failing all jobs in batch.',
        err,
        batchSize: jobsToProcess.length,
      });

      // manually move all jobs to failed state if the batch processor throws
      await Promise.all(jobsToProcess.map(async (job) => job.moveToFailed(err as Error, job.token!)));
    }
  }
}
