import { readPackageJsonSync } from '@map-colonies/read-pkg';
import { snakeCase } from 'change-case';

export const SERVICE_NAME = readPackageJsonSync().name ?? 'unknown_service';
export const SNAKED_SERVICE_NAME = snakeCase(SERVICE_NAME);
export const DEFAULT_SERVER_PORT = 80;

export const IGNORED_OUTGOING_TRACE_ROUTES = [/^.*\/v1\/metrics.*$/];
export const IGNORED_INCOMING_TRACE_ROUTES = [/^.*\/docs.*$/];

/* eslint-disable @typescript-eslint/naming-convention */
export const SERVICES = {
  LOGGER: Symbol('Logger'),
  CONFIG: Symbol('Config'),
  TRACER: Symbol('Tracer'),
  METRICS: Symbol('Metrics'),
  REDIS: Symbol('Redis'),
  REDIS_CLIENT: Symbol('RedisClient'),
  BULLMQ_WORKER_CONNECTION: Symbol('BullMqWorkerConnection'),
  BULLMQ_QUEUE_CONNECTION: Symbol('BullMqQueueConnection'),
  CLEANUP_REGISTRY: Symbol('CleanupRegistry'),
  OSM_ID_RESOLVER: Symbol('OsmIdResolver'),
} satisfies Record<string, symbol>;
/* eslint-enable @typescript-eslint/naming-convention */

export const ON_SIGNAL = Symbol('onSignal');

export const HEALTHCHECK = Symbol('healthcheck');

export const MS_IN_SECOND = 1000;
