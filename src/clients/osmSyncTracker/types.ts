export type EntityStatus = 'inprogress' | 'not_synced' | 'completed' | 'failed';

export type EntityAction = 'create' | 'modify' | 'delete';

export interface Entity {
  entityId: string;
  fileId: string;
  changesetId?: string;
  status?: EntityStatus;
  action?: EntityAction;
  failReason?: string;
}

export type EntityPatchRequest = Entity[];

export interface Changeset {
  changesetId: string;
  osmId?: number;
}

export type ChangesetPatchRequest = Required<Pick<Changeset, 'osmId'>>;

export interface IOsmSyncTracker {
  /**
   * PATCH /entity/_bulk
   *
   * Edits multiple entities in a bulk operation
   */
  patchEntities: (request: EntityPatchRequest) => Promise<void>;
  /**
   * POST /changeset
   *
   * Creates a new changeset
   */
  createChangeset: (request: Changeset) => Promise<void>;
  /**
   * PATCH /changeset/{changesetId}
   *
   * Updates an existing changeset
   */
  updateChangeset: (changesetId: string, request: ChangesetPatchRequest) => Promise<void>;
  /**
   * PATCH /changeset/{changesetId}/entities
   *
   * Closes all the entities of the given changeset
   */
  closeChangesetEntities: (changesetId: string) => Promise<void>;
  /**
   * POST /changeset/closure
   *
   * Creates closure jobs for a the given of changesets
   */
  createChangesetClosureJobs: (changesetIds: string[]) => Promise<void>;
}
