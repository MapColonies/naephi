import type { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '@common/constants';
import { BULL_FLOW_PRODUCER_SYMBOL, QueueEnum } from '@src/queueProvider/constants';
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
    const flowId = `${changesetId}-flow-attempt-${flowAttempt}`;

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
      name: `${changesetId}-closure`, // stage 4
      queueName: QueueEnum.CHANGESET_CLOSURE,
      opts: { jobId: `${flowId}-closure` },
      data: { changesetId, flowAttempt },
      children: [
        {
          name: `${changesetId}-post-upload`, // stage 3
          queueName: QueueEnum.CHANGESET_POST_UPLOAD,
          opts: { jobId: `${flowId}-post-upload` },
          data: { changesetId, flowAttempt },
          children: [
            {
              name: `${changesetId}-upload`, // stage 2
              queueName: QueueEnum.CHANGESET_UPLOAD,
              opts: { jobId: `${flowId}-upload` },
              data: { changesetId, flowAttempt },
              children: [
                {
                  name: `${changesetId}-pre-upload`, // stage 1
                  queueName: QueueEnum.CHANGESET_PRE_UPLOAD,
                  opts: { jobId: `${flowId}-pre-upload` },
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
