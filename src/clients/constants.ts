export const DEFAULT_RETRY_STRATEGY_DELAY = 0;

/* eslint-disable @typescript-eslint/naming-convention */
export const CLIENTS = {
  OSM_API: 'osmApi',
  OSM_SYNC_TRACKER: 'osmSyncTracker',
  CHANGE_MERGER: 'changeMerger',
  ID_TO_OSM: 'idToOsm',
} as const;
/* eslint-enable @typescript-eslint/naming-convention */

export type Client = (typeof CLIENTS)[keyof typeof CLIENTS];
