import axios, { AxiosInstance } from 'axios';
import axiosRetry, { exponentialDelay, IAxiosRetryConfig } from 'axios-retry';
import { ILogger } from '@src/common/interfaces';
import { ClientConfig, ClientOptions, DEFAULT_RETRY_STRATEGY_DELAY, RetryStrategy } from './options';

export abstract class BaseClient {
  protected readonly logger: ILogger | undefined;
  protected readonly httpClient: AxiosInstance;
  protected readonly options: ClientOptions;

  public constructor(clientConfig: ClientConfig) {
    const { logger, ...options } = clientConfig;
    this.logger = logger;
    this.options = options;
    this.httpClient = axios.create({ timeout: options.timeout });
    if (options.enableRetryStrategy === true) {
      this.configureRetryStrategy(options.retryStrategy as RetryStrategy);
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
