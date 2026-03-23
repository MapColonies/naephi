import { Job } from 'bullmq';
import { BatchWorkerOptions, BatchWorkerProviderOptions } from '../../options';
import { BULLMQ_KEY_PREFIX } from '../../constants';
import { bullMqOtelFactory } from '../../telemetry';
import { BullWorkerProvider } from '../bullWorkerProvider';
import { BatchWorker } from './batchWorker';

const UNSUPPORTED_PROCESS_JOB_MSG = 'processJob called on a BatchWorker. processBatch should be used instead.';

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
      prefix: BULLMQ_KEY_PREFIX,
      autorun: false,
      telemetry: bullMqOtelFactory(),
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
