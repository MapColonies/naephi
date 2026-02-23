import { JobType } from 'bullmq';

export enum QueueEnum {
  CHANGESET_PRE_UPLOAD = 'changeset-pre-uploads',
  CHANGESET_UPLOAD = 'changeset-uploads',
  CHANGESET_POST_UPLOAD = 'changeset-post-uploads',
  CHANGESET_CLOSURE_REQUEST = 'changeset-closure-requests',
}

export enum WorkerEnum {
  CHANGESET_PRE_UPLOAD = 'changeset-pre-upload-worker',
  CHANGESET_UPLOAD = 'changeset-upload-worker',
  CHANGESET_POST_UPLOAD = 'changeset-post-upload-worker',
  CHANGESET_CLOSURE_REQUEST = 'changeset-closure-request-worker',
}

export const QUEUE_KEY_PREFIX = '{naephi}'; //TODO: make configurable

export const REDIS_CONNECTION_OPTIONS_SYMBOL = Symbol('RedisConntionOptions');

export const BULL_FLOW_PRODUCER_SYMBOL = Symbol('BullFlowProducer');

export const CONSTANT_BULLMQ_WORKER_CONNECTION_OPTIONS = {
  maxRetriesPerRequest: null,
  enableOfflineQueue: true,
};

export const CONSTANT_BULLMQ_QUEUE_CONNECTION_OPTIONS = {
  enableOfflineQueue: false,
};

export const JOB_STATES: JobType[] = ['active', 'completed', 'delayed', 'failed', 'paused', 'wait', 'waiting', 'waiting-children'];
