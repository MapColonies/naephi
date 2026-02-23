import { BaseError } from '../error';

export class ChangesetNotFoundError extends BaseError {
  public constructor(changesetId: number) {
    super(`Changeset ${changesetId} not found in osm`);
  }
}

export class ChangesetCloseConflictError extends BaseError {
  public constructor(changesetId: number) {
    super(`Conflict closing changeset ${changesetId}`);
  }
}

export class ChangesetAlreadyClosedError extends BaseError {
  public constructor(changesetId: number) {
    super(`Changeset ${changesetId} is already closed`);
  }
}

export class ChangesetContentConflictError extends BaseError {
  public constructor(changesetId: number) {
    super(`Changeset ${changesetId} entity version mismatch or element already exists`);
  }
}
