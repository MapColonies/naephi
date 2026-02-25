import { readPackageJsonSync } from '@map-colonies/read-pkg';

export const SERVICE_NAME = readPackageJsonSync().name ?? 'unknown_service';
export const DEFAULT_SERVER_PORT = 80;

export const IGNORED_OUTGOING_TRACE_ROUTES = [/^.*\/v1\/metrics.*$/];
export const IGNORED_INCOMING_TRACE_ROUTES = [/^.*\/docs.*$/];

/* eslint-disable @typescript-eslint/naming-convention */
export const SERVICES = {
  LOGGER: Symbol('Logger'),
  CONFIG: Symbol('Config'),
  TRACER: Symbol('Tracer'),
  METRICS: Symbol('Metrics'),
  REDIS_CLIENT: Symbol('Redis'),
  REDIS_WORKER_CONNECTION: Symbol('RedisWorkerConnection'),
  REDIS_QUEUE_CONNECTION: Symbol('RedisQueueConnection'),
  CLEANUP_REGISTRY: Symbol('CleanupRegistry'),
  APP_CONFIG: Symbol('AppConfig'),
  OSM_API_CLIENT: Symbol('OsmApi'),
  OSM_SYNC_TRACKER_CLIENT: Symbol('OsmSyncTracker'),
  ID_TO_OSM_CLIENT: Symbol('IdToOsm'),
  CHANGE_MERGER_CLIENT: Symbol('ChangeMerger'),
} satisfies Record<string, symbol>;
/* eslint-enable @typescript-eslint/naming-convention */

export const ON_SIGNAL = Symbol('onSignal');

export const HEALTHCHECK = Symbol('healthcheck');

export const MS_IN_SECOND = 1000;
