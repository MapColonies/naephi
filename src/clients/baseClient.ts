import axios, { AxiosInstance, isAxiosError } from 'axios';
import axiosRetry, { exponentialDelay, IAxiosRetryConfig } from 'axios-retry';
import { ILogger } from '@src/common/interfaces';
import { ClientConfig, ClientOptions, DEFAULT_RETRY_STRATEGY_DELAY, RetryStrategy } from './options';
import { ErrorContext } from './error';

export abstract class BaseClient {
  protected readonly logger: ILogger | undefined;
  protected readonly httpClient: AxiosInstance;
  protected readonly options: ClientOptions;

  public constructor(clientConfig: ClientConfig) {
    const { logger, ...options } = clientConfig;
    this.logger = logger;
    this.options = options;
    this.httpClient = axios.create({ baseURL: options.url, timeout: options.timeout });
    if (options.enableRetryStrategy === true) {
      this.configureRetryStrategy(options.retryStrategy as RetryStrategy);
    }
  }

  protected logError(context: ErrorContext): void {
    const { err, msg, metadata } = context;

    if (isAxiosError(err)) {
      this.logger?.error({
        msg,
        err: {
          message: err.message,
          code: err.code,
          stack: err.stack,
        },
        status: err.response?.status,
        errorBody: err.response?.data as unknown,
        method: err.config?.method?.toUpperCase(),
        url: err.config?.url,
        clientOptions: this.options,
        ...metadata,
      });
    } else {
      this.logger?.error({
        msg,
        err: err instanceof Error ? { message: err.message, stack: err.stack } : err,
        clientOptions: this.options,
        ...metadata,
      });
    }
  }

  private configureRetryStrategy(retryStrategy: RetryStrategy): void {
    const config: IAxiosRetryConfig = {
      retries: retryStrategy.retries,
      shouldResetTimeout: retryStrategy.shouldResetTimeout,
      retryDelay: retryStrategy.isExponential === true ? exponentialDelay : (): number => retryStrategy.delay ?? DEFAULT_RETRY_STRATEGY_DELAY,
      onRetry: (retryCount, error, requestConfig) => {
        this.logger?.warn({ msg: `retrying request`, retryStrategy, retryCount, err: error, requestConfig });
      },
    };

    axiosRetry(this.httpClient, config);
  }
}
