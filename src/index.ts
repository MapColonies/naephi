// this import must be called before the first import of tsyringe
import 'reflect-metadata';
import { createServer } from 'http';
import { createTerminus } from '@godaddy/terminus';
import { Logger } from '@map-colonies/js-logger';
import { DependencyContainer } from 'tsyringe';
import { ConfigType } from '@common/config';
import { HEALTHCHECK, ON_SIGNAL, SERVICES } from './common/constants';
import { getApp } from './app';
import { BULLMQ_WORKERS_INITIALIZER } from './queueProvider/constants';
import { withTimeout } from './common/util';

const DEFAULT_INIT_TIMEOUT_MS = 30000;

const main = async (): Promise<void> => {
  let container: DependencyContainer | undefined;
  let logger: Logger | undefined;

  try {
    const { app, container: resolvedContainer } = await getApp();
    container = resolvedContainer;

    const logger = container.resolve<Logger>(SERVICES.LOGGER);
    const config = container.resolve<ConfigType>(SERVICES.CONFIG);
    const port = config.get('server.port');
    const initTimeout = config.get('app.initTimeout');

    const server = createTerminus(createServer(app), {
      healthChecks: { '/liveness': container.resolve(HEALTHCHECK) },
      onSignal: container.resolve(ON_SIGNAL),
    });

    server.listen(port, () => {
      logger.info(`app started on port ${port}`);
    });

    const workersInit = container.resolve<() => Promise<void>>(BULLMQ_WORKERS_INITIALIZER);
    try {
      await withTimeout(workersInit(), initTimeout ?? DEFAULT_INIT_TIMEOUT_MS);
    } catch (error) {
      throw new Error(`worker initialization failed: ${(error as Error).message}`, { cause: error });
    }
  } catch (error) {
    const logError = logger?.error.bind(logger) ?? console.error;

    logError({ msg: 'failed initializing the server', err: error });

    if (container?.isRegistered(ON_SIGNAL) === true) {
      const shutDown = container.resolve<() => Promise<void>>(ON_SIGNAL);
      await shutDown();
    }

    process.exit(1);
  }
};

void main();
