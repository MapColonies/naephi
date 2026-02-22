export interface IChangeMergerClient {
  merge: (req: MergeRequest) => Promise<unknown>;
  interpret: (changesetId: number, remote: Remote, options?: { action?: Action[]; lookupTags?: string[] }) => Promise<InterpretResult>;
}

export type OsmElementType = 'node' | 'way' | 'relation';
export type Action = 'create' | 'modify' | 'delete';
export type Remote = 'api' | 'replication';

export interface OsmElement {
  type: OsmElementType;
  id: number;
  timestamp?: string;
  version?: number;
  changeset?: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  nodes?: OsmElement[];
}

export interface OsmChange {
  type?: 'osmchange';
  version?: string;
  generator?: string;
  create?: OsmElement[];
  modify?: OsmElement[];
  delete?: OsmElement[];
}

export interface MergeRequest {
  changesetId: number;
  changes: {
    externalId: string;
    action: Action;
    change: OsmChange;
    tempOsmId?: number;
  }[];
}

export interface InterpretedMapping {
  type: OsmElementType;
  externalId: string;
  osmId: number;
  tags?: { k: string; v: string }[];
}

export interface InterpretResult {
  created?: InterpretedMapping[];
  modified?: InterpretedMapping[];
  deleted?: InterpretedMapping[];
}
