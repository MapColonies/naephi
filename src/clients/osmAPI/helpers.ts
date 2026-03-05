import { ChangesetStatus, OsmChangesetResponse } from './types';

export const determineChangesetStatus = ({ changeset }: OsmChangesetResponse): ChangesetStatus => {
  const isOpen = changeset.open;
  const isEmpty = changeset.changes_count === 0;

  if (isOpen && isEmpty) {
    return ChangesetStatus.OPEN_AND_EMPTY;
  }

  if (isOpen && !isEmpty) {
    return ChangesetStatus.OPEN_AND_FULL;
  }

  if (!isOpen && isEmpty) {
    return ChangesetStatus.CLOSED_AND_EMPTY;
  }

  return ChangesetStatus.CLOSED_AND_FULL;
};
