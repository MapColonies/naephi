import type { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '@common/constants';
import { BULL_FLOW_PRODUCER_SYMBOL, QueueEnum } from '@src/queueProvider/constants';
import type { FlowProducerProvider } from '@src/queueProvider/queues/interfaces';

export interface ChangesetFlowPayload {
  id: string;
}

@injectable()
export class FlowManager {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(BULL_FLOW_PRODUCER_SYMBOL) private readonly flowProducer: FlowProducerProvider
  ) {}

  public async initChangesetFlow(payload: ChangesetFlowPayload): Promise<void> {
    this.logger.info({ msg: 'initializing changeset upload flow', payload });

    const { id: changesetId } = payload;

    await this.flowProducer.add({
      name: `${changesetId}-closure-request`, // stage 4
      queueName: QueueEnum.CHANGESET_CLOSURE_REQUEST,
      data: { changesetId },
      children: [
        {
          name: `${changesetId}-post-upload`, // stage 3
          queueName: QueueEnum.CHANGESET_POST_UPLOAD,
          data: { changesetId },
          children: [
            {
              name: `${changesetId}-upload`, // stage 2
              queueName: QueueEnum.CHANGESET_UPLOAD,
              data: { changesetId },
              children: [
                {
                  name: `${changesetId}-pre-upload`, // stage 1
                  queueName: QueueEnum.CHANGESET_PRE_UPLOAD,
                  data: { changesetId },
                },
              ],
            },
          ],
        },
      ],
    });
  }
}
