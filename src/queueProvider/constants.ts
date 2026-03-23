import { JobType } from 'bullmq';
import { BatchOptions } from './options';

export enum QueueEnum {
  CHANGESET_PRE_UPLOAD = 'changeset-pre-uploads',
  CHANGESET_UPLOAD = 'changeset-uploads',
  CHANGESET_POST_UPLOAD = 'changeset-post-uploads',
  CHANGESET_CLOSURE = 'changeset-closure',
  CHANGESET_REDIS_CLEANUP = 'changeset-redis-cleanup',
  CHANGESET_OSM_CLEANUP = 'changeset-osm-cleanup',
}

export enum WorkerEnum {
  CHANGESET_PRE_UPLOAD = 'changeset-pre-upload-worker',
  CHANGESET_UPLOAD = 'changeset-upload-worker',
  CHANGESET_POST_UPLOAD = 'changeset-post-upload-worker',
  CHANGESET_CLOSURE = 'changeset-closure-worker',
  CHANGESET_REDIS_CLEANUP = 'changeset-redis-cleanup-worker',
  CHANGESET_OSM_CLEANUP = 'changeset-osm-cleanup-worker',
}

/* eslint-disable @typescript-eslint/naming-convention */
export const QueueIdentifiers = {
  CHANGESET_PRE_UPLOAD: 'changesetPreUpload',
  CHANGESET_UPLOAD: 'changesetUpload',
  CHANGESET_POST_UPLOAD: 'changesetPostUpload',
  CHANGESET_CLOSURE: 'changesetClosure',
  CHANGESET_REDIS_CLEANUP: 'changesetRedisCleanup',
  CHANGESET_OSM_CLEANUP: 'changesetOsmCleanup',
} as const satisfies Record<keyof typeof QueueEnum, string>;
/* eslint-enable @typescript-eslint/naming-convention */

export type QueueId = (typeof QueueIdentifiers)[keyof typeof QueueIdentifiers];

export const JOB_SUFFIX_MAP: Record<QueueEnum, string> = {
  [QueueEnum.CHANGESET_PRE_UPLOAD]: '-pre-upload',
  [QueueEnum.CHANGESET_UPLOAD]: '-upload',
  [QueueEnum.CHANGESET_POST_UPLOAD]: '-post-upload',
  [QueueEnum.CHANGESET_CLOSURE]: '-closure',
  [QueueEnum.CHANGESET_REDIS_CLEANUP]: '-redis-cleanup',
  [QueueEnum.CHANGESET_OSM_CLEANUP]: '-osm-cleanup',
};

export const JOB_CHILDREN_MAP: Record<QueueEnum, QueueEnum | null> = {
  [QueueEnum.CHANGESET_PRE_UPLOAD]: null,
  [QueueEnum.CHANGESET_UPLOAD]: QueueEnum.CHANGESET_PRE_UPLOAD,
  [QueueEnum.CHANGESET_POST_UPLOAD]: QueueEnum.CHANGESET_UPLOAD,
  [QueueEnum.CHANGESET_CLOSURE]: QueueEnum.CHANGESET_POST_UPLOAD,
  [QueueEnum.CHANGESET_REDIS_CLEANUP]: null,
  [QueueEnum.CHANGESET_OSM_CLEANUP]: null,
};

export const BULLMQ_KEY_PREFIX = '{naephi}';

export const BULLMQ_CONNECTION_OPTIONS_SYMBOL = Symbol('BullMqConntionOptions');

export const BULLMQ_FLOW_PRODUCER_SYMBOL = Symbol('BullMqFlowProducer');

export const BULLMQ_WORKERS_INITIALIZER = Symbol('BullMqWrokersInitializer');

export const CONSTANT_BULLMQ_WORKER_CONNECTION_OPTIONS = {
  maxRetriesPerRequest: null,
  enableOfflineQueue: true,
};

export const CONSTANT_BULLMQ_QUEUE_CONNECTION_OPTIONS = {
  enableOfflineQueue: false,
};

export const JOB_STATES: JobType[] = ['active', 'completed', 'delayed', 'failed', 'paused', 'wait', 'waiting', 'waiting-children'];

export const DEFAULT_BATCH_OPTIONS: BatchOptions = {
  size: 10,
  minSize: 1,
  timeout: 5000,
} as const;
