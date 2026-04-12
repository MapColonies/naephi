export const INITIAL_FLOW_ATTEMPT = 1;

/* eslint-disable @typescript-eslint/naming-convention */
export const FLOWS = {
  CHANGESET_UPLOAD: 'changesetUpload',
} as const;
/* eslint-enable @typescript-eslint/naming-convention */

export type Flow = (typeof FLOWS)[keyof typeof FLOWS];

export interface FlowOptions {
  maxAttempts: number;
}

export type FlowOptionsMap = Record<Flow, FlowOptions>;

export interface ChangesetFlowPayload {
  id: string;
  flowAttempt?: number;
}
