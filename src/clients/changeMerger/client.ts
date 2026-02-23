import { stringify } from 'qs';
import { BaseClient } from '../baseClient';
import { ClientConfig } from '../options';
import { Action, IChangeMerger, InterpretResult, MergeRequest, Remote } from './types';

export class ChangeMergerClient extends BaseClient implements IChangeMerger {
  public constructor(clientConfig: ClientConfig) {
    super(clientConfig);
  }

  public async merge(request: MergeRequest): Promise<unknown> {
    const metadata = { changesetId: request.changesetId, changesCount: request.changes.length };
    this.logger?.info({ msg: 'executing change merge request', ...metadata });

    try {
      const response = await this.httpClient.post('/change/merge', request);
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
