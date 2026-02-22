/* eslint-disable */
// This file was auto-generated. Do not edit manually.
// To update, run the error generation script again.

import type { TypedRequestHandlers as ImportedTypedRequestHandlers } from '@map-colonies/openapi-helpers/typedRequestHandler';
export type paths = {
  '/flow': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** initiate a new processing flow */
    post: operations['initiateFlow'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
};
export type webhooks = Record<string, never>;
export type components = {
  schemas: {
    error: {
      message: string;
    };
    flowRequest: components['schemas']['changesetFlowRequest'];
    baseFlow: {
      /** @description Identifies the specific flow logic to execute. */
      type: string;
    };
    changesetFlowRequest: components['schemas']['baseFlow'] & {
      /** @enum {string} */
      type?: 'changeset';
      /** Format: uuid */
      id: string;
    } & {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: 'changeset';
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
  initiateFlow: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['flowRequest'];
      };
    };
    responses: {
      /** @description Accepted */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Bad Request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['error'];
        };
      };
    };
  };
}
export type TypedRequestHandlers = ImportedTypedRequestHandlers<paths, operations>;
