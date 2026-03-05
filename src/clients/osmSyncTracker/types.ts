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

export type PatchEntitiesRequest = Entity[];

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
  patchEntities: (request: PatchEntitiesRequest) => Promise<void>;
  /**
   * GET /changeset/{changesetId}
   *
   * Fetch a changeset by id
   */
  getChangeset: (changesetId: string) => Promise<Changeset | null>;
  /**
   * POST /changeset
   *
   * Creates a new changeset
   */
  postChangeset: (request: Changeset) => Promise<void>;
  /**
   * PATCH /changeset/{changesetId}
   *
   * Updates an existing changeset
   */
  patchChangeset: (changesetId: string, request: ChangesetPatchRequest) => Promise<void>;
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
  postChangesetClosureJobs: (changesetIds: string[]) => Promise<void>;
}
