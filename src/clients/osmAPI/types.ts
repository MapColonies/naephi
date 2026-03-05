/* eslint-disable @typescript-eslint/naming-convention */
export interface ChangesetTags {
  [key: string]: string;
  created_by: string;
  comment: string;
}

export interface ChangesetCreateRequest {
  tags: ChangesetTags;
}

export interface OsmChangesetResponse {
  version: string;
  generator: string;
  copyright: string;
  attribution: string;
  license: string;
  changeset: {
    id: number;
    created_at: string;
    closed_at?: string;
    open: boolean;
    user: string;
    uid: number;
    min_lat?: number;
    min_lon?: number;
    max_lat?: number;
    max_lon?: number;
    comments_count: number;
    changes_count: number;
    tags?: Record<string, string>;
  };
}

export enum ChangesetStatus {
  OPEN_AND_EMPTY,
  OPEN_AND_FULL,
  CLOSED_AND_EMPTY,
  CLOSED_AND_FULL,
}

export interface IOsmAPI {
  /**
   * PUT /api/0.6/changeset/create
   *
   * Opens a new changeset for editing.
   * @returns The OSM ID of the newly created changeset.
   */
  createChangeset: (request: ChangesetCreateRequest) => Promise<number>;
  /**
   * GET /api/0.6/changeset/{changesetId}.json
   *
   * Fetches existing changeset.
   * @returns The changeset with its metadata.
   */
  getChangeset: (changesetId: number) => Promise<OsmChangesetResponse>;
  /**
   * PUT /api/0.6/changeset/{changesetId}/close
   *
   * Attemt to close an open changeset.
   */
  closeChangeset: (changesetId: number) => Promise<void>;
  /**
   * POST /api/0.6/changeset/{changesetId}/upload
   *
   * Uploads an osmChange paylod to an open changeset.
   */
  uploadChangeset: (changesetId: number, osmChangeXml: string) => Promise<void>;
}
