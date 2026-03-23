import { injectable } from 'tsyringe';
import { JobsOptions, Queue } from 'bullmq';
import { Counter, Gauge, Registry } from 'prom-client';
import { snakeCase } from 'change-case';
import { ILogger } from '@src/common/interfaces';
import { SNAKED_SERVICE_NAME } from '@src/common/constants';
import { JOB_STATES } from '../constants';
import { type QueueOptions } from '../options';
import { BulkJobsOptions, JobQueueProvider } from './interfaces';

@injectable()
export class BullQueueProvider<T = unknown> implements JobQueueProvider<T> {
  private readonly queue: Queue<T, unknown, string, T, unknown, string>;
  private readonly queueName: string;
  private readonly logger: ILogger;
  private readonly metricsRegistry: Registry | undefined;

  private readonly addedCounter?: Counter<'kind'>;

  public constructor(options: QueueOptions) {
    const { queue, queueName, logger, metricsRegistry } = options;
    this.queue = queue as Queue<T, unknown, string, T, unknown, string>;
    this.queueName = queueName;
    this.logger = logger;
    this.metricsRegistry = metricsRegistry;

    this.logger.info({ msg: 'initializing queue', queueName });

    if (this.metricsRegistry !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      new Gauge({
        name: `${SNAKED_SERVICE_NAME}_${snakeCase(this.queueName)}_state_counts`,
        help: 'The number of current jobs in different states in the queue',
        labelNames: ['state'] as const,
        async collect(): Promise<void> {
          const statesCount = await self.queue.getJobCounts(...JOB_STATES);
          JOB_STATES.forEach((jobState) => this.set({ state: jobState }, statesCount[jobState] ?? 0));
        },
        registers: [this.metricsRegistry],
      });

      this.addedCounter = new Counter({
        name: `${SNAKED_SERVICE_NAME}_${snakeCase(this.queueName)}_total_added`,
        help: 'The total number of added jobs by kind of addition',
        labelNames: ['kind'] as const,
        registers: [this.metricsRegistry],
      });
    }
  }

  public get activeQueueName(): string {
    return this.queueName;
  }

  public async close(): Promise<void> {
    await this.queue.close();
  }

  public async add(jobName: string, job: T, options?: JobsOptions): Promise<void> {
    this.logger.info({ msg: 'adding a single job to queue', queueName: this.queueName, jobName, job, options, jobId: options?.jobId });

    await this.queue.add(jobName, job, options);

    this.addedCounter?.inc({ kind: 'single' });
    this.addedCounter?.inc({ kind: 'total' });
  }

  public async addBulk(jobs: T[], options?: BulkJobsOptions): Promise<void> {
    this.logger.info({ msg: 'adding a bulk of jobs to queue', queueName: this.queueName, count: jobs.length, options });

    if (jobs.length === 0) {
      return;
    }

    const bulk = jobs.map((job, index) => ({
      data: job,
      name: options?.baseName != null ? `${options.baseName}-${index}` : `${index}`,
      opts: options,
    }));

    await this.queue.addBulk(bulk);

    this.addedCounter?.inc({ kind: 'bulk' });
    this.addedCounter?.inc({ kind: 'total' }, bulk.length);
  }
}
