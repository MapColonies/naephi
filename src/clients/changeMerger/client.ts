import { inject, injectable } from 'tsyringe';
import { stringify } from 'qs';
import type { Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { SERVICES } from '@src/common/constants';
import type { ConfigType } from '@src/common/config';
import { BaseClient } from '../baseClient';
import type { ClientOptions } from '../options';
import { CLIENTS } from '../constants';
import { Action, IChangeMerger, InterpretResult, MergeRequest, MergeResponse, Remote } from './types';

@injectable()
export class ChangeMergerClient extends BaseClient implements IChangeMerger {
  public constructor(
    @inject(SERVICES.CONFIG) config: ConfigType,
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.METRICS) metricsRegistry: Registry
  ) {
    const options = config.get(`app.clients.${CLIENTS.CHANGE_MERGER}`) as unknown as ClientOptions;
    const clientLogger = logger.child({ component: CLIENTS.CHANGE_MERGER });
    super({ clientName: CLIENTS.CHANGE_MERGER, ...options, logger: clientLogger, metricsRegistry });
  }

  public async merge(request: MergeRequest): Promise<MergeResponse> {
    const metadata = { changesetId: request.changesetId, changesCount: request.changes.length };
    this.logger?.info({ msg: 'executing change merge request', ...metadata });

    try {
      const response = await this.httpClient.post<MergeResponse>('/change/merge', request);
      return response.data;
    } catch (error) {
      this.logError({ err: error, msg: 'failed to merge change request', metadata });

      throw error;
    }
  }

  public async interpret(changesetId: number, remote: Remote, options: { action?: Action[]; lookupTags?: string[] } = {}): Promise<InterpretResult> {
    const metadata = { changesetId, remote, interpretationOptions: options };
    this.logger?.info({ msg: 'executing remote change interpretation', ...metadata });

    try {
      const response = await this.httpClient.get<InterpretResult>(`/change/${changesetId}/interpret`, {
        params: {
          remote,
          action: options.action,
          lookupTags: options.lookupTags,
        },
        paramsSerializer: (params) => stringify(params, { arrayFormat: 'repeat' }),
      });
      return response.data;
    } catch (error) {
      this.logError({ err: error, msg: 'failed to interpret change', metadata });

      throw error;
    }
  }
}
