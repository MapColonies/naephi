export const DEFAULT_RETRY_STRATEGY_DELAY = 0;

export const CLIENTS = {
  OSM_API: 'OsmApi',
  OSM_SYNC_TRACKER: 'OsmSyncTracker',
  CHANGE_MERGER: 'ChangeMerger',
  ID_TO_OSM: 'IdToOsm',
} as const;

export type Client = (typeof CLIENTS)[keyof typeof CLIENTS];
