import { JobsOptions } from 'bullmq';
import type { ConfigType } from '@src/common/config';
import { QueueId, QueueIdentifiers } from '../constants';

let jobOptionsMap: JobOptionsMap | undefined;

export type JobOptionsMap = Record<QueueId, JobsOptions>;

export const getJobOptionsMap = (config: ConfigType): JobOptionsMap => {
  jobOptionsMap ??= Object.values(QueueIdentifiers).reduce<JobOptionsMap>((acc, queueId) => {
    acc[queueId] = config.get(`app.queues.${queueId}.jobOptions`) as unknown as JobsOptions;
    return acc;
  }, {} as JobOptionsMap);

  return jobOptionsMap;
};
