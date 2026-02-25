import { SERVICE_NAME } from '@src/common/constants';
import { ChangesetTags } from './types';

export const DEFAULT_CREATE_CHANGESET_TAGS: ChangesetTags = {
  ['created_by']: SERVICE_NAME,
  comment: 'vector ingestion changeset upload',
};
