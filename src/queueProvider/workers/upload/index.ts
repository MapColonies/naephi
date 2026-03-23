import { constructor } from 'tsyringe/dist/typings/types';
import { WorkerEnum } from '../../constants';
import { PreUploadWorker } from './preUploadWorker';
import { UploadWorker } from './uploadWorker';
import { PostUploadWorker } from './postUploadWorker';
import { ClosureWorker } from './closureWorker';
import { OsmCleanupWorker } from './osmCleanupWorker';
import { RedisCleanupWorker } from './redisCleanupWorker';

export const workerIdToClass = (workerId: WorkerEnum): constructor<unknown> => {
  switch (workerId) {
    case WorkerEnum.CHANGESET_PRE_UPLOAD:
      return PreUploadWorker;
    case WorkerEnum.CHANGESET_UPLOAD:
      return UploadWorker;
    case WorkerEnum.CHANGESET_POST_UPLOAD:
      return PostUploadWorker;
    case WorkerEnum.CHANGESET_CLOSURE:
      return ClosureWorker;
    case WorkerEnum.CHANGESET_OSM_CLEANUP:
      return OsmCleanupWorker;
    case WorkerEnum.CHANGESET_REDIS_CLEANUP:
      return RedisCleanupWorker;
  }
};

export { PreUploadWorker, UploadWorker, PostUploadWorker, ClosureWorker, OsmCleanupWorker, RedisCleanupWorker };
