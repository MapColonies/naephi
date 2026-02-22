import { AxiosError } from 'axios';
import { stringify } from 'qs';
import { BaseClient } from '../baseClient';
import { ClientConfig } from '../options';
import { Action, IChangeMergerClient, InterpretResult, MergeRequest, Remote } from './types';

export class ChangeMergerClient extends BaseClient implements IChangeMergerClient {
  public constructor(clientConfig: ClientConfig) {
    super(clientConfig);
  }

  public async merge(req: MergeRequest): Promise<unknown> {
    this.logger?.debug({ msg: 'merging change request', changesetId: req.changesetId, changesCount: req.changes.length, options: this.options });

    try {
      const response = await this.httpClient.post('/change/merge', req);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;

      this.logger?.error({
        msg: 'failed to merge change request',
        changesetId: req.changesetId,
        err: axiosError,
        options: this.options,
      });

      throw axiosError;
    }
  }

  public async interpret(changesetId: number, remote: Remote, options: { action?: Action[]; lookupTags?: string[] } = {}): Promise<InterpretResult> {
    this.logger?.debug({ msg: 'merging change request', changesetId, remote, interpretationOptions: options, options: this.options });

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
      const axiosError = error as AxiosError;

      this.logger?.error({
        msg: 'failed to interpret change',
        changesetId: changesetId,
        remote,
        interpretationOptions: options,
        err: axiosError,
        options: this.options,
      });

      throw axiosError;
    }
  }
}
