// this import must be called before the first import of tsyringe
import 'reflect-metadata';
import { createServer } from 'http';
import { createTerminus } from '@godaddy/terminus';
import { Logger } from '@map-colonies/js-logger';
import { DependencyContainer } from 'tsyringe';
import { ConfigType } from '@common/config';
// import { HEALTHCHECK, ON_SIGNAL, SERVICES, WORKERS_INITIALIZER } from './common/constants';
import { HEALTHCHECK, ON_SIGNAL, SERVICES } from './common/constants';
import { getApp } from './app';

let depContainer: DependencyContainer | undefined;

void getApp()
  // .then(async ({ app, container }) => {
  .then(({ app, container }) => {
    depContainer = container;
    const logger = container.resolve<Logger>(SERVICES.LOGGER);
    const config = container.resolve<ConfigType>(SERVICES.CONFIG);
    const port = config.get('server.port');

    const server = createTerminus(createServer(app), {
      healthChecks: { '/liveness': depContainer.resolve(HEALTHCHECK) },
      onSignal: depContainer.resolve(ON_SIGNAL),
    });

    server.listen(port, () => {
      logger.info(`app started on port ${port}`);
    });

    // const wokrersInit = depContainer.resolve<() => Promise<void>>(WORKERS_INITIALIZER);
    // await wokrersInit();
    // try {
    //   await wokrersInit();
    // } catch (error) {
    //   logger.error({ msg: 'worker init failed', err: error });
    // }
  })
  .catch(async (error: Error) => {
    const errorLogger =
      depContainer?.isRegistered(SERVICES.LOGGER) == true
        ? depContainer.resolve<Logger>(SERVICES.LOGGER).error.bind(depContainer.resolve<Logger>(SERVICES.LOGGER))
        : console.error;
    errorLogger({ msg: '😢 - failed initializing the server', err: error });

    if (depContainer?.isRegistered(ON_SIGNAL) == true) {
      const shutDown: () => Promise<void> = depContainer.resolve(ON_SIGNAL);
      await shutDown();
    }
    process.exit(1);
  });
