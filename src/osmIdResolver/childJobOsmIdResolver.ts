import { Job, UnrecoverableError } from 'bullmq';
import { inject, injectable } from 'tsyringe';
import type { Logger } from '@map-colonies/js-logger';
import { SERVICES } from '@src/common/constants';
import { JOB_CHILDREN_MAP, JOB_SUFFIX_MAP, QueueEnum } from '@src/queueProvider/constants';
import { ChangesetUploadData, ChangesetUploadReturn } from '../queueProvider/workers/upload/types';
import { IOsmIdResolver } from './interfaces';

@injectable()
export class ChildJobOsmIdResolver implements IOsmIdResolver {
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger) {}

  public async resolve(job: Job<ChangesetUploadData>): Promise<number> {
    const { changesetId } = job.data;

    const currentQueue = job.queueName as QueueEnum;
    const childQueue = JOB_CHILDREN_MAP[currentQueue];

    if (childQueue === null) {
      this.logger.error({
        msg: 'could not resolve osm id',
        resolver: 'childJob',
        changesetId,
        jobId: job.id,
        jobName: job.name,
        queue: currentQueue,
      });

      throw new Error(`queue ${currentQueue} does not have a child dependency for osmId resolution.`);
    }

    const childSuffix = JOB_SUFFIX_MAP[childQueue];
    const childJobKey = `${changesetId}${childSuffix}`;

    this.logger.info({
      msg: 'resolving changeset osm id',
      resolver: 'childJob',
      changesetId,
      jobId: job.id,
      jobName: job.name,
      queue: currentQueue,
      childQueue,
      childJobKey,
    });

    const childrenValues = await job.getChildrenValues();
    const value = childrenValues[childJobKey] as ChangesetUploadReturn | undefined;

    if (value === undefined) {
      this.logger.error({
        msg: 'failed to resolve osm id',
        resolver: 'childJob',
        changesetId,
        jobId: job.id,
        jobName: job.name,
        queue: currentQueue,
        childQueue,
        childJobKey,
        resolved: value,
      });

      throw new UnrecoverableError(`Missing osmId in child job: ${childJobKey}`);
    }

    return value.osmId;
  }
}
