import { Job } from 'bullmq';
import { BatchWorkerOptions, BatchWorkerProviderOptions } from '../options';
import { QUEUE_KEY_PREFIX } from '../constants';
import { bullMqOtelFactory } from '../telemetry';
import { BullWorkerProvider } from './bullWorkerProvider';
import { BatchWorker } from './batchWorker';

export abstract class BullBatchWorkerProvider<DataType = unknown> extends BullWorkerProvider<DataType, void> {
  protected override readonly workerOptions: BatchWorkerOptions;

  public constructor(options: BatchWorkerProviderOptions) {
    super(options);
    this.workerOptions = options;
  }

  protected override createWorker(): void {
    const workerConstructorOptions = {
      ...this.workerOptions,
      connection: this.connection,
      prefix: QUEUE_KEY_PREFIX,
      autorun: false,
      telemetry: bullMqOtelFactory(),
    };

    this.worker = new BatchWorker(this.queueName, this.processBatch.bind(this), workerConstructorOptions);

    this.setupEventListenerts();
  }

  protected abstract processBatch(jobs: Job<DataType, void>[]): Promise<void>;
}
