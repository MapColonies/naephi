import { Queue as BullQueue, FlowProducer } from 'bullmq';
import { DependencyContainer, FactoryFunction } from 'tsyringe';
import ioRedis from 'ioredis';
import { Logger } from '@map-colonies/js-logger';
import { CleanupRegistry } from '@map-colonies/cleanup-registry';
import { Registry } from 'prom-client';
import { SERVICES } from '@src/common/constants';
import { ConfigType } from '@src/common/config';
import { bullMqOtelFactory } from '../telemetry';
import { BullWorkerProvider } from '../workers/bullWorkerProvider';
import { BullQueueProvider } from './bullQueueProvider';
import { BullFlowProducerProvider } from './bullFlowProducerProvider';

export const bullQueueProviderFactory = (queueName: string): FactoryFunction<BullQueueProvider> => {
  const factoryFn: FactoryFunction<BullQueueProvider> = (container) => {
    const connection = container.resolve<ioRedis>(SERVICES.BULLMQ_QUEUE_CONNECTION);
    const logger = container.resolve<Logger>(SERVICES.LOGGER);
    const queueLogger = logger.child({ component: queueName });
    const metricsRegistry = container.resolve<Registry>(SERVICES.METRICS);
    const config = container.resolve<ConfigType>(SERVICES.CONFIG);
    const prefix = config.get('bullmq.keyPrefix');

    const queue = new BullQueue(queueName, {
      connection,
      prefix,
      telemetry: bullMqOtelFactory(),
    });

    return new BullQueueProvider({ queueName, queue, logger: queueLogger, metricsRegistry });
  };

  return factoryFn;
};

export const bullFlowProviderFactory: FactoryFunction<BullFlowProducerProvider> = (container) => {
  const redisConnection = container.resolve<ioRedis>(SERVICES.BULLMQ_QUEUE_CONNECTION);
  const logger = container.resolve<Logger>(SERVICES.LOGGER);
  const flowLogger = logger.child({ component: 'flow-producer' });
  const metricsRegistry = container.resolve<Registry>(SERVICES.METRICS);
  const config = container.resolve<ConfigType>(SERVICES.CONFIG);
  const prefix = config.get('bullmq.keyPrefix');

  const flow = new FlowProducer({ connection: redisConnection, prefix, telemetry: bullMqOtelFactory() });
  const flowProducerProv = new BullFlowProducerProvider({ flow, logger: flowLogger, metricsRegistry });
  return flowProducerProv;
};

export const bullWorkerPostInjectionHookFactory = (symbol: symbol | string): ((container: DependencyContainer) => void) => {
  const postInjectionHookFn = (container: DependencyContainer): void => {
    const worker = container.resolve<BullWorkerProvider>(symbol);
    const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);
    cleanupRegistry.register({ id: symbol, func: worker.close.bind(worker) });
  };

  return postInjectionHookFn;
};
