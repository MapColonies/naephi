import { BaseError } from '../error';

/**
 * Thrown when the OSM API returns HTTP 404 for a changeset upload or close operation.
 *
 * This occurs when:
 * - The changeset ID does not exist in the OSM database.
 * - The changeset references element IDs that do not exist in the OSM database.
 */
export class ChangesetNotFoundError extends BaseError {
  public constructor(changesetId: number, responseBody?: string) {
    super(`Changeset ${changesetId} not found in osm`, { responseBody });
  }
}

/**
 * Thrown when the OSM API returns HTTP 409 for a changeset close operation.
 *
 * This occurs when:
 * - The changeset has already been closed (manually or via auto-close).
 * - The user attempting to close the changeset is not the one who created it.
 */
export class ChangesetCloseConflictError extends BaseError {
  public constructor(changesetId: number, responseBody?: string) {
    super(`Conflict closing changeset ${changesetId}`, { responseBody });
  }
}

/**
 * Thrown when the OSM API returns HTTP 409 during a changeset upload, and the response body
 * contains "closed at", indicating the changeset was closed before the upload completed.
 *
 * This occurs when:
 * - The changeset was closed manually by the user before the upload.
 * - The changeset was auto-closed by the server (e.g. idle timeout of 1 hour,
 *   open for more than 24 hours, or the element limit was reached mid-upload).
 */
export class ChangesetAlreadyClosedError extends BaseError {
  public constructor(changesetId: number, responseBody?: string) {
    super(`Changeset ${changesetId} is already closed`, { responseBody });
  }
}

/**
 * Thrown when the OSM API returns HTTP 409 during a changeset upload for reasons other than
 * the changeset being closed.
 *
 * This occurs when:
 * - An element version in the changeset does not match the current version on the server
 *   (optimistic locking / version mismatch).
 * - An element's changeset ID in the changeset does not match the changeset being uploaded to.
 * - The user uploading the changeset is not the owner of the changeset.
 *
 * Processing stops at the first conflicting element — subsequent elements in the changeset
 * are not evaluated. The entire upload is rejected and no changes are committed.
 */
export class ChangesetContentConflictError extends BaseError {
  public constructor(changesetId: number, responseBody?: string) {
    super(`Changeset ${changesetId} entity version mismatch or element already exists`, { responseBody });
  }
}

/**
 * Thrown when the OSM API returns HTTP 400 during a changeset upload.
 *
 * This occurs when:
 * - The uploaded OsmChange XML is malformed or cannot be parsed.
 * - A placeholder ID (negative ID for newly created elements) is missing or not unique.
 * - A way contains more than configured amount of nodes (hard limit, always enforced).
 * - A tag key or value exceeds 255 UTF-8 codepoints (hard limit, always enforced).
 * - The number of tags on an element exceeds the configured --max-element-tags limit
 *   (optional server-side limit, disabled by default).
 * - A relation exceeds the configured --max-relation-members limit
 *   (optional server-side limit, default 32,000 on osm.org since February 2022).
 *
 * The entire upload is rejected and no changes are committed.
 */
export class ChangesetPayloadError extends BaseError {
  public constructor(changesetId: number, responseBody?: string) {
    super(`Changeset ${changesetId} upload errored while parsing payload`, { responseBody });
  }
}

/**
 * Thrown when the OSM API returns HTTP 413 during a changeset upload.
 *
 * This occurs in two distinct scenarios depending on the CGImap version:
 *
 * 1. Uncompressed request body exceeds the server's --max-payload limit (default: 50 MB).
 *    The check fires during body streaming, before any XML parsing or DB writes.
 *    No element processing occurs.
 *
 * 2. (CGImap v0.9.3+) The changeset would cause the changeset bounding box to exceed the
 *    maximum permitted area. The response body contains "Changeset bounding box size
 *    limit exceeded." This check fires after parsing, but still within the DB transaction,
 *    so no changes are committed.
 */
export class ChangesetTooLargeError extends BaseError {
  public constructor(changesetId: number, responseBody?: string) {
    super(`Changeset ${changesetId} upload errored due to payload/content too large`, { responseBody });
  }
}

/**
 * Thrown when the OSM API returns HTTP 410 during a changeset upload.
 *
 * This occurs when:
 * - A <delete> block in the OsmChange changeset targets an element that has already been
 *   deleted on the server, and the if-unused attribute is not set on the <delete> block.
 *
 * Note: if the if-unused attribute is present, the server silently skips already-deleted
 * elements instead of returning 410. Consider using if-unused on <delete> blocks to avoid
 * this error in cases where concurrent deletions are possible.
 *
 * The entire upload is rejected and no changes are committed.
 */
export class ChangesetElementGoneError extends BaseError {
  public constructor(changesetId: number, responseBody?: string) {
    super(`Changeset ${changesetId} upload attempted to delete an already-deleted element`, { responseBody });
  }
}

/**
 * Thrown when the OSM API returns HTTP 412 during a changeset upload.
 *
 * This occurs when:
 * - A <delete> block targets a node that is still referenced by a way or relation,
 *   and the if-unused attribute is not set. The response body contains the IDs of
 *   the referencing ways or relations.
 * - A <delete> block targets a way that is still a member of a relation,
 *   and the if-unused attribute is not set.
 * - A <delete> block targets a relation that is still a member of another relation,
 *   and the if-unused attribute is not set.
 * - A relation being created or modified references a node, way, or relation member
 *   that does not exist or is not visible (i.e. deleted) on the server.
 *
 * Note: if the if-unused attribute is present on a <delete> block, elements that are
 * still in use are silently skipped rather than causing this error. Consider using
 * if-unused on <delete> blocks to avoid this error when referential state is uncertain.
 *
 * The entire upload is rejected and no changes are committed.
 */
export class ChangesetPreconditionError extends BaseError {
  public constructor(changesetId: number, responseBody?: string) {
    super(`Changeset ${changesetId} upload failed due to a referential integrity violation`, { responseBody });
  }
}
