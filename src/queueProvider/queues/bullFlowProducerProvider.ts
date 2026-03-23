import { injectable } from 'tsyringe';
import { FlowJob, FlowOpts, FlowProducer, JobNode } from 'bullmq';
import { Counter, Registry } from 'prom-client';
import { ILogger } from '@src/common/interfaces';
import { SNAKED_SERVICE_NAME } from '@src/common/constants';
import { type FlowProducerOptions } from '../options';
import { FlowProducerProvider } from './interfaces';

@injectable()
export class BullFlowProducerProvider implements FlowProducerProvider {
  private readonly flowProducer: FlowProducer;
  private readonly logger: ILogger;
  private readonly metricsRegistry: Registry | undefined;

  private readonly addedCounter?: Counter;

  public constructor(options: FlowProducerOptions) {
    const { flow, logger, metricsRegistry } = options;
    this.flowProducer = flow;
    this.logger = logger;
    this.metricsRegistry = metricsRegistry;

    this.logger.info({ msg: 'initializing flow producer' });

    if (this.metricsRegistry !== undefined) {
      this.addedCounter = new Counter({
        name: `${SNAKED_SERVICE_NAME}_flows_total_added_count`,
        help: 'The total number of added flows',
        registers: [this.metricsRegistry],
      });
    }
  }

  public async close(): Promise<void> {
    await this.flowProducer.close();
  }

  public async add(flowJob: FlowJob, opts?: FlowOpts): Promise<JobNode> {
    this.logger.info({
      msg: 'adding a flow to queues',
      flowOpts: { opts, ...flowJob.opts },
      rootFlowJobQueue: flowJob.queueName,
      rootFlowJobName: flowJob.name,
    });

    const tree = await this.flowProducer.add(flowJob, opts);

    this.addedCounter?.inc();

    return tree;
  }
}
