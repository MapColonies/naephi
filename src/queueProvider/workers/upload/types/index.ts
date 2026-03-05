export interface PartialChangesetData {
  changesetId: string;
}

export interface CompleteChangesetIdentifiers {
  changesetId: string;
  osmId: number;
}

export interface ChangesetMetadata {
  flowAttempt: number;
}

export type ChangesetUploadData = PartialChangesetData & ChangesetMetadata;

export type ChangesetUploadReturn = CompleteChangesetIdentifiers;
