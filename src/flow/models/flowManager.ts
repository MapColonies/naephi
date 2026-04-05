import type { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '@common/constants';
import { BULLMQ_FLOW_PRODUCER_SYMBOL, JOB_SUFFIX_MAP, QueueEnum, QueueIdentifiers } from '@src/queueProvider/constants';
import type { FlowProducerProvider } from '@src/queueProvider/queues/interfaces';
import type { ConfigType } from '@src/common/config';
import { getJobOptionsMap, JobOptionsMap } from '@src/queueProvider/queues/helpers';
import { ChangesetFlowPayload, FlowOptions, FlowOptionsMap, FLOWS, INITIAL_FLOW_ATTEMPT } from './flow';

@injectable()
export class FlowManager {
  private readonly flowConfigMap: FlowOptionsMap;
  private readonly jobOptionsMap: JobOptionsMap;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(BULLMQ_FLOW_PRODUCER_SYMBOL) private readonly flowProducer: FlowProducerProvider,
    @inject(SERVICES.CONFIG) config: ConfigType
  ) {
    this.flowConfigMap = Object.values(FLOWS).reduce<FlowOptionsMap>((acc, flow) => {
      acc[flow] = config.get(`app.flows.${flow}`) as unknown as FlowOptions;
      return acc;
    }, {} as FlowOptionsMap);

    this.jobOptionsMap = getJobOptionsMap(config);
  }

  public async initChangesetFlow(payload: ChangesetFlowPayload): Promise<void> {
    this.logger.info({ msg: 'initializing changeset upload flow', payload });

    const { id: changesetId, flowAttempt = INITIAL_FLOW_ATTEMPT } = payload;
    const flowId = `${changesetId}-${flowAttempt}`;

    const { maxAttempts } = this.flowConfigMap[FLOWS.CHANGESET_UPLOAD];

    if (flowAttempt > maxAttempts) {
      this.logger.error({
        msg: 'aborting flow initialization, max re-init flow attempts reached',
        changesetId,
        flowId,
        flowAttempt,
        maxAttempts,
      });

      return;
    }

    await this.flowProducer.add({
      name: `${changesetId}${JOB_SUFFIX_MAP[QueueEnum.CHANGESET_CLOSURE]}`,
      queueName: QueueEnum.CHANGESET_CLOSURE,
      opts: { ...this.jobOptionsMap[QueueIdentifiers.CHANGESET_CLOSURE], jobId: `${flowId}${JOB_SUFFIX_MAP[QueueEnum.CHANGESET_CLOSURE]}` },
      data: { changesetId, flowAttempt },
      children: [
        {
          name: `${changesetId}${JOB_SUFFIX_MAP[QueueEnum.CHANGESET_POST_UPLOAD]}`,
          queueName: QueueEnum.CHANGESET_POST_UPLOAD,
          opts: {
            ...this.jobOptionsMap[QueueIdentifiers.CHANGESET_POST_UPLOAD],
            jobId: `${flowId}${JOB_SUFFIX_MAP[QueueEnum.CHANGESET_POST_UPLOAD]}`,
          },
          data: { changesetId, flowAttempt },
          children: [
            {
              name: `${changesetId}${JOB_SUFFIX_MAP[QueueEnum.CHANGESET_UPLOAD]}`,
              queueName: QueueEnum.CHANGESET_UPLOAD,
              opts: { ...this.jobOptionsMap[QueueIdentifiers.CHANGESET_UPLOAD], jobId: `${flowId}${JOB_SUFFIX_MAP[QueueEnum.CHANGESET_UPLOAD]}` },
              data: { changesetId, flowAttempt },
              children: [
                {
                  name: `${changesetId}${JOB_SUFFIX_MAP[QueueEnum.CHANGESET_PRE_UPLOAD]}`,
                  queueName: QueueEnum.CHANGESET_PRE_UPLOAD,
                  opts: {
                    ...this.jobOptionsMap[QueueIdentifiers.CHANGESET_PRE_UPLOAD],
                    jobId: `${flowId}${JOB_SUFFIX_MAP[QueueEnum.CHANGESET_PRE_UPLOAD]}`,
                  },
                  data: { changesetId, flowAttempt },
                },
              ],
            },
          ],
        },
      ],
    });
  }
}
