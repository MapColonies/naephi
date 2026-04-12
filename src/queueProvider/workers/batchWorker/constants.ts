import { BatchOptions } from '@src/queueProvider/options';

export const DEFAULT_WORKER_LOCK_DURATION = 30000;

export const TIMEOUT_WINDOW_MULTIPLIER = 2;

export const WORST_CASE_PROCESSING_MULTIPLIER = 2;

export const DEFAULT_BATCH_OPTIONS: Required<BatchOptions> = {
  size: 10,
  minSize: 1,
  timeout: 5000,
  lockDuration: 30000,
} as const;

export const UNSUPPORTED_PROCESS_JOB_MSG = 'processJob called on a BatchWorker. processBatch should be used instead.';

// eslint-disable-next-line @typescript-eslint/no-magic-numbers
export const BATCH_SIZE_HISTOGRAM_METRIC_BUCKETS = [1, 2, 5, 10, 25, 50, 100];
