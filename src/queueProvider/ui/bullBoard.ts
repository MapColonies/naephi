import { Queue as BullQueue } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import ioRedis from 'ioredis';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '@src/common/constants';
import { type ConfigType } from '@src/common/config';
import { QUEUE_KEY_PREFIX, QueueEnum } from '../constants';

@injectable()
export class BullBoard {
  private readonly serverAdapter: ExpressAdapter;

  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: ConfigType,
    @inject(SERVICES.REDIS_QUEUE_CONNECTION) private readonly redisConnection: ioRedis
  ) {
    const uiPath = this.config.get('app.uiPath') as string;
    this.serverAdapter = new ExpressAdapter();
    this.serverAdapter.setBasePath(uiPath);
  }

  public getBullBoardRouter(): ReturnType<ExpressAdapter['getRouter']> {
    const queues = Object.values(QueueEnum).map(
      (queueName) => new BullQueue(queueName, { connection: this.redisConnection, prefix: QUEUE_KEY_PREFIX })
    );

    createBullBoard({
      queues: queues.map((queue) => new BullMQAdapter(queue)),
      serverAdapter: this.serverAdapter,
    });

    return this.serverAdapter.getRouter();
  }
}
