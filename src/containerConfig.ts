import { instancePerContainerCachingFactory } from 'tsyringe';
import { getOtelMixin } from '@map-colonies/tracing-utils';
import { trace } from '@opentelemetry/api';
import ioRedis from 'ioredis';
import { Registry } from 'prom-client';
import { HealthCheck } from '@godaddy/terminus';
import { DependencyContainer } from 'tsyringe/dist/typings/types';
import { jsLogger, Logger } from '@map-colonies/js-logger';
import { CleanupRegistry } from '@map-colonies/cleanup-registry';
import { InjectionObject, registerDependencies, RegisterOptions } from '@common/dependencyRegistration';
import { HEALTHCHECK, ON_SIGNAL, SERVICES, SERVICE_NAME } from '@common/constants';
import { getTracing } from '@common/tracing';
import { FLOW_ROUTER_SYMBOL, flowRouterFactory } from './flow/routes/flowRouter';
import { ConfigType, getConfig } from './common/config';
import { BULL_FLOW_PRODUCER_SYMBOL, QueueEnum, REDIS_CONNECTION_OPTIONS_SYMBOL, WorkerEnum } from './queueProvider/constants';
import { bullFlowProviderFactory, bullQueueProviderFactory } from './queueProvider/queues/factories';
import { BullQueueProvider } from './queueProvider/queues/bullQueueProvider';
import {
  createConnectionOptionsFactory,
  createReusableRedisQueueConnectionFactory,
  createReusableRedisWorkerConnectionFactory,
} from './queueProvider/connection';
import { BullFlowProducerProvider } from './queueProvider/queues/bullFlowProducerProvider';

const registerBullDeps = (): InjectionObject<unknown>[] => {
  const queueProvidersDeps: InjectionObject<unknown>[] = [
    QueueEnum.CHANGESET_PRE_UPLOAD,
    QueueEnum.CHANGESET_UPLOAD,
    QueueEnum.CHANGESET_POST_UPLOAD,
    QueueEnum.CHANGESET_CLOSURE_REQUEST,
  ].map((queueName) => ({
    token: queueName,
    provider: {
      useFactory: instancePerContainerCachingFactory(bullQueueProviderFactory(queueName)),
    },
    postInjectionHook: (deps: DependencyContainer): void => {
      const queue = deps.resolve<BullQueueProvider>(queueName);
      const cleanupRegistry = deps.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);
      cleanupRegistry.register({ id: queueName, func: queue.close.bind(queue) });
    },
  }));

  // const workerProvidersDeps: InjectionObject<unknown>[] = Object.values(WorkerEnum).map((workerId) => ({
  //   token: workerId,
  //   provider: { useClass: workerIdToClass(workerId) },
  //   options: { lifecycle: Lifecycle.ContainerScoped },
  //   postInjectionHook: bullWorkerPostInjectionHookFactory(workerId),
  // }));

  const bullDependencies: InjectionObject<unknown>[] = [
    { token: REDIS_CONNECTION_OPTIONS_SYMBOL, provider: { useFactory: instancePerContainerCachingFactory(createConnectionOptionsFactory) } },
    {
      token: SERVICES.REDIS_WORKER_CONNECTION,
      provider: { useFactory: instancePerContainerCachingFactory(createReusableRedisWorkerConnectionFactory) },
    },
    {
      token: SERVICES.REDIS_QUEUE_CONNECTION,
      provider: { useFactory: instancePerContainerCachingFactory(createReusableRedisQueueConnectionFactory) },
    },
    {
      token: BULL_FLOW_PRODUCER_SYMBOL,
      provider: {
        useFactory: instancePerContainerCachingFactory(bullFlowProviderFactory),
      },
      postInjectionHook: (deps: DependencyContainer): void => {
        const flowProducer = deps.resolve<BullFlowProducerProvider>(BULL_FLOW_PRODUCER_SYMBOL);
        const cleanupRegistry = deps.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);
        cleanupRegistry.register({ id: BULL_FLOW_PRODUCER_SYMBOL, func: flowProducer.close.bind(flowProducer) });
      },
    },
    ...queueProvidersDeps,
    // ...workerProvidersDeps,
    // {
    //   token: WORKERS_INITIALIZER,
    //   provider: {
    //     useFactory: (container): (() => Promise<void>) => {
    //       const promises = Object.values(WorkerEnum).map(async (workerName) => {
    //         const worker = container.resolve<BullWorkerProvider>(workerName);
    //         await worker.start();
    //       });

    //       return async (): Promise<void> => {
    //         await Promise.all(promises);
    //       };
    //     },
    //   },
    // },
  ];

  return bullDependencies;
};

export const registerExternalValues = async (options?: RegisterOptions): Promise<DependencyContainer> => {
  const cleanupRegistry = new CleanupRegistry();

  try {
    const dependencies: InjectionObject<unknown>[] = [
      { token: SERVICES.CONFIG, provider: { useValue: getConfig() } },
      // { token: SERVICES.APP_CONFIG, provider: { useValue: getConfig().get('app') } },
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
      // {
      //   token: SERVICES.HTTP_CLIENT,
      //   provider: {
      //     useFactory: instancePerContainerCachingFactory((container) => {
      //       const config = container.resolve<ConfigType>(SERVICES.CONFIG);
      //       const options = config.get('app.interpreter');

      //       if (!options) {
      //         return;
      //       }

      //       const { baseUrl: baseURL, auth, xApiKey, timeout } = options;

      //       const headers = xApiKey !== undefined ? { [X_API_KEY_HEADER]: xApiKey } : {};
      //       const client = axios.create({ baseURL, auth, headers, timeout });
      //       return client;
      //     }),
      //   },
      // },
      { token: FLOW_ROUTER_SYMBOL, provider: { useFactory: flowRouterFactory } },
      {
        token: HEALTHCHECK,
        provider: {
          useFactory: (container): HealthCheck => {
            const redis = container.resolve<ioRedis>(SERVICES.REDIS_QUEUE_CONNECTION);
            return async (): Promise<void> => {
              await Promise.all([redis.ping()]);
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
