import type { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '@common/constants';
import { BULL_FLOW_PRODUCER_SYMBOL, JOB_SUFFIX_MAP, QueueEnum } from '@src/queueProvider/constants';
import type { FlowProducerProvider } from '@src/queueProvider/queues/interfaces';

export interface ChangesetFlowPayload {
  id: string;
  flowAttempt?: number;
}

@injectable()
export class FlowManager {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(BULL_FLOW_PRODUCER_SYMBOL) private readonly flowProducer: FlowProducerProvider
  ) {}

  public async initChangesetFlow(payload: ChangesetFlowPayload): Promise<void> {
    this.logger.info({ msg: 'initializing changeset upload flow', payload });

    const { id: changesetId, flowAttempt = 1 } = payload;
    const flowId = `${changesetId}-${flowAttempt}`;

    if (flowAttempt > 3) {
      // TODO: make configurable
      this.logger.fatal({
        msg: 'aborting flow initialization, max re-init flow attempts reached',
        changesetId,
        flowAttempt,
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
