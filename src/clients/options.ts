import { ILogger } from '@src/common/interfaces';

export const DEFAULT_RETRY_STRATEGY_DELAY = 0;

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
}

export interface ClientConfig extends ClientOptions {
  logger?: ILogger;
}
