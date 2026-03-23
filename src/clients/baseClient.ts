import axios, { AxiosError, AxiosInstance, isAxiosError } from 'axios';
import axiosRetry, { exponentialDelay, IAxiosRetryConfig } from 'axios-retry';
import { Counter, Histogram, Registry } from 'prom-client';
import { snakeCase } from 'change-case';
import { ILogger } from '@src/common/interfaces';
import { MS_IN_SECOND, SNAKED_SERVICE_NAME } from '@src/common/constants';
import { ClientConfig, ClientOptions, ErrorContext, RetryStrategy } from './options';
import { Client, DEFAULT_RETRY_STRATEGY_DELAY } from './constants';
import { applyBasicAuth, applyOAuth1, applyOAuth2, AuthConfig, AUTHORIZATION_HEADER, createOAuthSigner } from './auth';

export abstract class BaseClient {
  protected readonly clientName: Client;
  protected readonly logger: ILogger | undefined;
  protected readonly metricsRegistry: Registry | undefined;
  protected readonly httpClient: AxiosInstance;
  protected readonly options: ClientOptions;
  private readonly requestDuration?: Histogram;
  private readonly requestCounter?: Counter;

  public constructor(clientConfig: ClientConfig) {
    const { clientName, logger, metricsRegistry, ...options } = clientConfig;
    this.clientName = clientName;
    this.logger = logger;
    this.metricsRegistry = metricsRegistry;
    this.options = options;
    this.httpClient = axios.create({ baseURL: options.url, timeout: options.timeout, headers: options.headers });

    if (options.enableRetryStrategy === true) {
      this.configureRetryStrategy(options.retryStrategy as RetryStrategy);
    }

    if (this.metricsRegistry !== undefined) {
      const clientMetricName = snakeCase(this.clientName);

      this.requestDuration = new Histogram({
        name: `${SNAKED_SERVICE_NAME}_${clientMetricName}_request_duration_seconds`,
        help: `HTTP request duration for ${this.clientName} client`,
        labelNames: ['method', 'status'] as const,
        registers: [this.metricsRegistry],
      });

      this.requestCounter = new Counter({
        name: `${SNAKED_SERVICE_NAME}_${clientMetricName}_request_count`,
        help: `HTTP request count for ${this.clientName} client`,
        labelNames: ['method', 'status'] as const,
        registers: [this.metricsRegistry],
      });
    }

    this.configureInterceptors();
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

  private configureInterceptors(): void {
    if (this.options.auth !== undefined) {
      this.configureAuth(this.options.auth);
    }

    if (!this.metricsRegistry) {
      return;
    }

    this.httpClient.interceptors.request.use((config) => {
      config.metadata = { startTime: Date.now() };
      return config;
    });

    this.httpClient.interceptors.response.use(
      (response) => {
        const method = response.config.method?.toUpperCase() ?? 'UNKNOWN';
        const status = String(response.status);
        if (response.config.metadata?.startTime !== undefined) {
          const duration = (Date.now() - response.config.metadata.startTime) / MS_IN_SECOND;
          this.requestDuration?.observe({ method, status }, duration);
        }

        this.requestCounter?.inc({ method, status });

        return response;
      },
      async (error: AxiosError) => {
        const method = error.config?.method?.toUpperCase() ?? 'UNKNOWN';
        const status = String(error.response?.status ?? 'network_error');

        if (error.config?.metadata?.startTime !== undefined) {
          const duration = (Date.now() - error.config.metadata.startTime) / MS_IN_SECOND;
          this.requestDuration?.observe({ method, status }, duration);
        }

        this.requestCounter?.inc({ method, status });

        return Promise.reject(error);
      }
    );
  }

  private configureAuth(auth: AuthConfig): void {
    const oauthSigner = auth.type === 'oauth1' ? createOAuthSigner(auth) : undefined;

    this.httpClient.interceptors.request.use((config) => {
      switch (auth.type) {
        case 'basic':
          applyBasicAuth(config, auth);
          break;
        case 'oauth1':
          applyOAuth1(config, auth, oauthSigner!, this.options.url);
          break;
        case 'oauth2':
          applyOAuth2(config, auth);
          break;
      }
      return config;
    });
  }
}
