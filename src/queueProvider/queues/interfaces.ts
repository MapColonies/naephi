import { FlowJob, FlowOpts, JobNode, JobsOptions } from 'bullmq';

export interface BulkJobsOptions extends JobsOptions {
  baseName?: string;
}

export interface JobQueueProvider<T> {
  activeQueueName: string;
  add: (jobName: string, job: T, options?: JobsOptions) => Promise<void>;
  addBulk: (jobs: T[], options?: BulkJobsOptions) => Promise<void>;
  close: () => Promise<void>;
}

export interface FlowProducerProvider {
  add: (flow: FlowJob, opts?: FlowOpts) => Promise<JobNode>;
  close: () => Promise<void>;
}
