import { Registry } from 'prom-client';
import { ILogger } from '@src/common/interfaces';
import { Client } from './constants';
import { AuthConfig } from './auth';

export interface ErrorContext {
  err: unknown;
  msg: string;
  metadata?: Record<string, unknown>;
}

export interface RetryStrategy {
  retries?: number;
  shouldResetTimeout?: boolean;
  isExponential?: boolean;
  delay?: number;
}

export interface ClientOptions {
  url: string;
  timeout?: number;
  enableRetryStrategy?: boolean;
  retryStrategy?: RetryStrategy;
  auth?: AuthConfig;
  headers?: Record<string, string>;
}

export interface ClientConfig extends ClientOptions {
  clientName: Client;
  logger?: ILogger;
  metricsRegistry?: Registry;
}
