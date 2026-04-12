import { Job, UnrecoverableError } from 'bullmq';
import { inject, injectable } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { SERVICES } from '@src/common/constants';
import type { IOsmSyncTracker } from '@src/clients/osmSyncTracker/types';
import { CLIENTS } from '@src/clients/constants';
import { ChangesetUploadData } from '../queueProvider/workers/upload/types';
import { IOsmIdResolver } from './interfaces';

@injectable()
export class TrackerOsmIdResolver implements IOsmIdResolver {
  public constructor(
    @inject(CLIENTS.OSM_SYNC_TRACKER) private readonly tracker: IOsmSyncTracker,
    @inject(SERVICES.LOGGER) private readonly logger: Logger
  ) {}

  public async resolve(job: Job<ChangesetUploadData>): Promise<number> {
    const { changesetId } = job.data;

    this.logger.info({ msg: 'resolving changeset osm id', resolver: 'tracker', changesetId, jobId: job.id, jobName: job.name, queue: job.queueName });

    const changeset = await this.tracker.getChangeset(changesetId);

    if (changeset?.osmId === undefined) {
      this.logger.error({
        msg: 'failed to resolve osm id',
        resolver: 'tracker',
        changesetId,
        resolved: changeset,
        jobId: job.id,
        jobName: job.name,
        queue: job.queueName,
      });
      throw new UnrecoverableError(`osmId not found in tracker for ${job.data.changesetId}`);
    }

    return changeset.osmId;
  }
}
