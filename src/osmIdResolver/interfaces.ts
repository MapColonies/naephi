import { Job } from 'bullmq';
import { ChangesetUploadData } from '../queueProvider/workers/upload/types';

export interface IOsmIdResolver {
  resolve: (job: Job<ChangesetUploadData>) => Promise<number>;
}
