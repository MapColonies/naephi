export interface Entity {
  externalId: string;
  osmId: number;
}

export interface BulkCreateRequest {
  action: 'create';
  payload: Entity[];
}

export interface BulkDeleteRequest {
  action: 'delete';
  payload: string[];
}

export type MultiBulkRequest = [BulkOperationRequest, BulkOperationRequest];

export type BulkOperationRequest = BulkCreateRequest | BulkDeleteRequest;

export type EntityBulkRequest = BulkCreateRequest | BulkDeleteRequest | MultiBulkRequest;

export interface IIdToOsm {
  /**
   * POST /entity/bulk
   *
   * Executes entity bulk operation
   */
  bulk: (request: EntityBulkRequest) => Promise<void>;
}
