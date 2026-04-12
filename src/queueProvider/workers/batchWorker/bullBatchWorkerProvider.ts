import { Job } from 'bullmq';
import { BatchWorkerOptions, BatchWorkerProviderOptions } from '../../options';
import { BULLMQ_KEY_PREFIX } from '../../constants';
import { bullMqOtelFactory } from '../../telemetry';
import { BullWorkerProvider } from '../bullWorkerProvider';
import { BatchWorker } from './batchWorker';
import { DEFAULT_BATCH_OPTIONS, UNSUPPORTED_PROCESS_JOB_MSG } from './constants';

export abstract class BullBatchWorkerProvider<DataType = unknown> extends BullWorkerProvider<DataType, void> {
  protected override readonly workerOptions: BatchWorkerOptions;

  public constructor(options: BatchWorkerProviderOptions) {
    super(options);
    this.workerOptions = {
      ...options.workerOptions,
      batch: options.batch,
      logger: options.logger,
      metricsRegistry: options.metricsRegistry,
    };
  }

  protected override createWorker(): void {
    const workerConstructorOptions: BatchWorkerOptions = {
      ...this.workerOptions,
      // concurrency should match or be greater than batch size
      concurrency: Math.max(this.workerOptions.concurrency ?? 1, this.workerOptions.batch?.size ?? DEFAULT_BATCH_OPTIONS.size),
      connection: this.connection,
      prefix: BULLMQ_KEY_PREFIX,
      autorun: false,
      telemetry: bullMqOtelFactory(),
      logger: this.logger,
    };

    this.worker = new BatchWorker(this.queueName, this.processBatch.bind(this), workerConstructorOptions);

    this.setupEventListenerts();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async processJob(job: Job<DataType, void>): Promise<void> {
    this.logger.error({ msg: UNSUPPORTED_PROCESS_JOB_MSG, jobId: job.id, queueName: this.queueName });
    throw new Error(UNSUPPORTED_PROCESS_JOB_MSG);
  }

  protected abstract processBatch(jobs: Job<DataType, void>[]): Promise<void>;
}
