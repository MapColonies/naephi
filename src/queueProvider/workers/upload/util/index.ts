import { InterpretResult } from '@src/clients/changeMerger/types';
import { Entity, MultiBulkRequest } from '@src/clients/idToOsm/types';

/**
 * Transforms interpretation result into the specific structure required by id-to-osm bulk request.
 * Returns a single BulkOperationRequest or a MultiBulkRequest tuple.
 */
export const prepareEntityBulkRequest = (interpretation: InterpretResult): MultiBulkRequest | null => {
  const createPayload: Entity[] = (interpretation.created ?? []).map((item) => ({
    externalId: item.externalId,
    osmId: item.osmId,
  }));

  const deletePayload: string[] = (interpretation.deleted ?? []).map((item) => item.externalId);

  const hasCreated = createPayload.length > 0;
  const hasDeleted = deletePayload.length > 0;

  if (!hasCreated && !hasDeleted) {
    return null;
  }

  return [
    { action: 'create', payload: createPayload },
    { action: 'delete', payload: deletePayload },
  ];
};
