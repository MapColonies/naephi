import type { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '@common/constants';
import { BULLMQ_FLOW_PRODUCER_SYMBOL, JOB_SUFFIX_MAP, QueueEnum } from '@src/queueProvider/constants';
import type { FlowProducerProvider } from '@src/queueProvider/queues/interfaces';
import type { ConfigType } from '@src/common/config';
import { ChangesetFlowPayload, FlowOptions, FlowOptionsMap, FLOWS, INITIAL_FLOW_ATTEMPT } from './flow';

@injectable()
export class FlowManager {
  private readonly flowConfigMap: FlowOptionsMap;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(BULLMQ_FLOW_PRODUCER_SYMBOL) private readonly flowProducer: FlowProducerProvider,
    @inject(SERVICES.CONFIG) config: ConfigType
  ) {
    this.flowConfigMap = Object.values(FLOWS).reduce<FlowOptionsMap>((acc, flow) => {
      acc[flow] = config.get(`app.flows.${flow}`) as unknown as FlowOptions;
      return acc;
    }, {} as FlowOptionsMap);
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
      name: `${changesetId}${JOB_SUFFIX_MAP[QueueEnum.CHANGESET_CLOSURE]}`, // stage 4
      queueName: QueueEnum.CHANGESET_CLOSURE,
      opts: { jobId: `${flowId}${JOB_SUFFIX_MAP[QueueEnum.CHANGESET_CLOSURE]}` },
      data: { changesetId, flowAttempt },
      children: [
        {
          name: `${changesetId}${JOB_SUFFIX_MAP[QueueEnum.CHANGESET_POST_UPLOAD]}`, // stage 3
          queueName: QueueEnum.CHANGESET_POST_UPLOAD,
          opts: { jobId: `${flowId}${JOB_SUFFIX_MAP[QueueEnum.CHANGESET_POST_UPLOAD]}` },
          data: { changesetId, flowAttempt },
          children: [
            {
              name: `${changesetId}${JOB_SUFFIX_MAP[QueueEnum.CHANGESET_UPLOAD]}`, // stage 2
              queueName: QueueEnum.CHANGESET_UPLOAD,
              opts: { jobId: `${flowId}${JOB_SUFFIX_MAP[QueueEnum.CHANGESET_UPLOAD]}` },
              data: { changesetId, flowAttempt },
              children: [
                {
                  name: `${changesetId}${JOB_SUFFIX_MAP[QueueEnum.CHANGESET_PRE_UPLOAD]}`, // stage 1
                  queueName: QueueEnum.CHANGESET_PRE_UPLOAD,
                  opts: { jobId: `${flowId}${JOB_SUFFIX_MAP[QueueEnum.CHANGESET_PRE_UPLOAD]}` },
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
