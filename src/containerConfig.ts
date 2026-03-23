import { DependencyContainer, instancePerContainerCachingFactory, Lifecycle, predicateAwareClassFactory } from 'tsyringe';
import { getOtelMixin } from '@map-colonies/tracing-utils';
import { trace } from '@opentelemetry/api';
import ioRedis from 'ioredis';
import { Registry } from 'prom-client';
import { HealthCheck } from '@godaddy/terminus';
import { jsLogger, Logger } from '@map-colonies/js-logger';
import { CleanupRegistry } from '@map-colonies/cleanup-registry';
import axios from 'axios';
import { InjectionObject, registerDependencies, RegisterOptions } from '@common/dependencyRegistration';
import { HEALTHCHECK, ON_SIGNAL, SERVICES, SERVICE_NAME } from '@common/constants';
import { getTracing } from '@common/tracing';
import { FLOW_ROUTER_SYMBOL, flowRouterFactory } from './flow/routes/flowRouter';
import { ConfigType, getConfig } from './common/config';
import {
  BULLMQ_FLOW_PRODUCER_SYMBOL,
  QueueEnum,
  BULLMQ_CONNECTION_OPTIONS_SYMBOL,
  WorkerEnum,
  BULLMQ_WORKERS_INITIALIZER,
} from './queueProvider/constants';
import { bullFlowProviderFactory, bullQueueProviderFactory, bullWorkerPostInjectionHookFactory } from './queueProvider/queues/factories';
import { BullQueueProvider } from './queueProvider/queues/bullQueueProvider';
import {
  createBullMqConnectionOptionsFactory,
  createReusableRedisQueueConnectionFactory,
  createReusableRedisWorkerConnectionFactory,
} from './queueProvider/connection';
import { BullFlowProducerProvider } from './queueProvider/queues/bullFlowProducerProvider';
import { IOsmIdResolver } from './osmIdResolver/interfaces';
import { AppConfig } from './common/interfaces';
import { TrackerOsmIdResolver } from './osmIdResolver/trackerOsmIdResolver';
import { ChildJobOsmIdResolver } from './osmIdResolver/childJobOsmIdResolver';
import { workerIdToClass } from './queueProvider/workers/upload';
import { BullWorkerProvider } from './queueProvider/workers/bullWorkerProvider';
import { createRedisFactory } from './redis/connection';
import { CLIENTS } from './clients/constants';
import { OsmApiClient } from './clients/osmAPI/client';
import { ChangeMergerClient } from './clients/changeMerger/client';
import { IdToOsmClient } from './clients/idToOsm/client';
import { OsmSyncTrackerClient } from './clients/osmSyncTracker/client';

const registerBullDeps = (): InjectionObject<unknown>[] => {
  const queueProvidersDeps: InjectionObject<unknown>[] = Object.values(QueueEnum).map((queueName) => ({
    token: queueName,
    provider: {
      useFactory: instancePerContainerCachingFactory(bullQueueProviderFactory(queueName)),
    },
    postInjectionHook: (container: DependencyContainer): void => {
      const queue = container.resolve<BullQueueProvider>(queueName);
      const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);
      cleanupRegistry.register({ id: queueName, func: queue.close.bind(queue) });
    },
  }));

  const workerProvidersDeps: InjectionObject<unknown>[] = Object.values(WorkerEnum).map((workerId) => ({
    token: workerId,
    provider: { useClass: workerIdToClass(workerId) },
    options: { lifecycle: Lifecycle.ContainerScoped },
    postInjectionHook: bullWorkerPostInjectionHookFactory(workerId),
  }));

  const bullDependencies: InjectionObject<unknown>[] = [
    { token: BULLMQ_CONNECTION_OPTIONS_SYMBOL, provider: { useFactory: instancePerContainerCachingFactory(createBullMqConnectionOptionsFactory) } },
    {
      token: SERVICES.BULLMQ_WORKER_CONNECTION,
      provider: { useFactory: instancePerContainerCachingFactory(createReusableRedisWorkerConnectionFactory) },
    },
    {
      token: SERVICES.BULLMQ_QUEUE_CONNECTION,
      provider: { useFactory: instancePerContainerCachingFactory(createReusableRedisQueueConnectionFactory) },
    },
    {
      token: BULLMQ_FLOW_PRODUCER_SYMBOL,
      provider: {
        useFactory: instancePerContainerCachingFactory(bullFlowProviderFactory),
      },
      postInjectionHook: (container: DependencyContainer): void => {
        const flowProducer = container.resolve<BullFlowProducerProvider>(BULLMQ_FLOW_PRODUCER_SYMBOL);
        const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);
        cleanupRegistry.register({ id: BULLMQ_FLOW_PRODUCER_SYMBOL, func: flowProducer.close.bind(flowProducer) });
      },
    },
    ...queueProvidersDeps,
    ...workerProvidersDeps,
    {
      token: BULLMQ_WORKERS_INITIALIZER,
      provider: {
        useFactory: (container): (() => Promise<void>) => {
          const promises = Object.values(WorkerEnum).map(async (workerName) => {
            const worker = container.resolve<BullWorkerProvider>(workerName);
            await worker.start();
          });

          return async (): Promise<void> => {
            await Promise.all(promises);
          };
        },
      },
    },
  ];

  return bullDependencies;
};

export const registerExternalValues = async (options?: RegisterOptions): Promise<DependencyContainer> => {
  const cleanupRegistry = new CleanupRegistry();

  try {
    const dependencies: InjectionObject<unknown>[] = [
      { token: SERVICES.CONFIG, provider: { useValue: getConfig() } },
      { token: SERVICES.APP_CONFIG, provider: { useValue: getConfig().get('app') } },
      {
        token: SERVICES.CLEANUP_REGISTRY,
        provider: { useValue: cleanupRegistry },
        afterAllInjectionHook(container): void {
          const logger = container.resolve<Logger>(SERVICES.LOGGER);
          const cleanupRegistryLogger = logger.child({ subComponent: 'cleanupRegistry' });

          cleanupRegistry.on('itemFailed', (id, error, msg) => cleanupRegistryLogger.error({ msg, itemId: id, err: error }));
          cleanupRegistry.on('itemCompleted', (id) => cleanupRegistryLogger.info({ itemId: id, msg: 'cleanup finished for item' }));
          cleanupRegistry.on('finished', (status) => cleanupRegistryLogger.info({ msg: `cleanup registry finished cleanup`, status }));
        },
      },
      {
        token: SERVICES.LOGGER,
        provider: {
          useFactory: instancePerContainerCachingFactory((container) => {
            const config = container.resolve<ConfigType>(SERVICES.CONFIG);
            const loggerConfig = config.get('telemetry.logger');
            const logger = jsLogger({ ...loggerConfig, mixin: getOtelMixin() });
            return logger;
          }),
        },
      },
      {
        token: SERVICES.TRACER,
        provider: {
          useFactory: instancePerContainerCachingFactory((container) => {
            const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);
            cleanupRegistry.register({ id: SERVICES.TRACER, func: getTracing().stop.bind(getTracing()) });
            const tracer = trace.getTracer(SERVICE_NAME);
            return tracer;
          }),
        },
      },
      {
        token: SERVICES.METRICS,
        provider: {
          useFactory: instancePerContainerCachingFactory((container) => {
            const metricsRegistry = new Registry();
            const config = container.resolve<ConfigType>(SERVICES.CONFIG);
            config.initializeMetrics(metricsRegistry);
            return metricsRegistry;
          }),
        },
      },
      {
        token: SERVICES.REDIS_CLIENT,
        provider: {
          useFactory: instancePerContainerCachingFactory(createRedisFactory),
        },
      },
      {
        token: CLIENTS.OSM_API,
        provider: { useClass: OsmApiClient },
        options: { lifecycle: Lifecycle.Singleton },
      },
      {
        token: CLIENTS.CHANGE_MERGER,
        provider: { useClass: ChangeMergerClient },
        options: { lifecycle: Lifecycle.Singleton },
      },
      {
        token: CLIENTS.ID_TO_OSM,
        provider: { useClass: IdToOsmClient },
        options: { lifecycle: Lifecycle.Singleton },
      },
      {
        token: CLIENTS.OSM_SYNC_TRACKER,
        provider: { useClass: OsmSyncTrackerClient },
        options: { lifecycle: Lifecycle.Singleton },
      },
      {
        token: SERVICES.OSM_ID_RESOLVER,
        provider: {
          useFactory: predicateAwareClassFactory<IOsmIdResolver>(
            (container) => container.resolve<AppConfig>(SERVICES.APP_CONFIG).osmIdResolver === 'tracker',
            TrackerOsmIdResolver,
            ChildJobOsmIdResolver
          ),
        },
      },
      { token: FLOW_ROUTER_SYMBOL, provider: { useFactory: flowRouterFactory } },
      {
        token: HEALTHCHECK,
        provider: {
          useFactory: (container): HealthCheck => {
            const bullMq = container.resolve<ioRedis>(SERVICES.BULLMQ_QUEUE_CONNECTION);
            return async (): Promise<void> => {
              await Promise.all([bullMq.ping()]);
            };
          },
        },
      },
      {
        token: ON_SIGNAL,
        provider: {
          useValue: cleanupRegistry.trigger.bind(cleanupRegistry),
        },
      },
      ...registerBullDeps(),
    ];
    const container = await registerDependencies(dependencies, options?.override, options?.useChild);
    return container;
  } catch (error) {
    await cleanupRegistry.trigger();
    throw error;
  }
};
