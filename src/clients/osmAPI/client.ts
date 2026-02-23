import { isAxiosError } from 'axios';
import { StatusCodes } from 'http-status-codes';
import { SERVICE_NAME } from '@src/common/constants';
import { BaseClient } from '../baseClient';
import { ClientConfig } from '../options';
import { ChangesetCreateRequest, IOsmAPI, OsmChangesetResponse } from './types';
import { ChangesetAlreadyClosedError, ChangesetCloseConflictError, ChangesetNotFoundError, ChangesetContentConflictError } from './errors';

export class OsmAPI extends BaseClient implements IOsmAPI {
  public constructor(clientConfig: ClientConfig) {
    super(clientConfig);
  }

  public async createChangeset(request: ChangesetCreateRequest): Promise<number> {
    this.logger?.info({ msg: 'executing osm changeset creation', request });

    const xmlBody = this.serializeChangesetXml(request);

    try {
      const response = await this.httpClient.put<string>('/api/0.6/changeset/create', xmlBody, {
        headers: { 'Content-Type': 'text/xml' },
        responseType: 'text',
      });

      const changesetId = parseInt(response.data, 10);

      if (isNaN(changesetId)) {
        throw new Error(`Invalid response from OSM API: ${response.data}`); //TODO: create custom error
      }

      return changesetId;
    } catch (error) {
      this.logError({ err: error, msg: 'OSM Changeset creation failed', metadata: { request } });
      throw error;
    }
  }

  public async getChangeset(changesetId: number): Promise<OsmChangesetResponse> {
    this.logger?.info({ msg: 'executing osm changeset fetch', changesetId });

    try {
      const response = await this.httpClient.get<OsmChangesetResponse>(`/api/0.6/changeset/${changesetId}.json`);

      return response.data;
    } catch (error) {
      this.logError({ err: error, msg: 'failed to fetch osm changeset', metadata: { changesetId } });
      throw error;
    }
  }

  public async uploadDiff(changesetId: number, osmChangeXml: string): Promise<void> {
    this.logger?.info({ msg: 'executing osm upload diff', changesetId });

    try {
      await this.httpClient.post<unknown>(`/api/0.6/changeset/${changesetId}/upload`, osmChangeXml, {
        headers: { 'Content-Type': 'text/xml' },
        responseType: 'text',
      });
    } catch (error) {
      this.logError({ err: error, msg: 'failed changeset upload', metadata: { changesetId } });

      // TODO: handle errors
      if (isAxiosError(error) && error.response?.status !== undefined) {
        switch (error.response.status) {
          case 400:
            throw new Error(`Bad Request`);

          case 404:
            throw new ChangesetNotFoundError(changesetId);

          case 409:
            // Conflict: Changeset closed, or version mismatch
            if ((error.response.data as string).includes('closed')) {
              throw new ChangesetAlreadyClosedError(changesetId);
            }
            throw new ChangesetContentConflictError(changesetId);

          case 413:
            // Payload too large (OSM limit is usually 50k elements)
            throw new Error(`Diff upload too large for OSM`);
        }
      }
      throw error;
    }
  }

  public async closeChangeset(changesetId: number): Promise<void> {
    this.logger?.info({ msg: 'executing osm changeset close', changesetId });

    try {
      await this.httpClient.put(`/api/0.6/changeset/${changesetId}/close`, null, {
        headers: { 'Content-Type': 'text/xml' },
      });
    } catch (error) {
      this.logError({ err: error, msg: 'failed to close OSM changeset', metadata: { changesetId } });

      if (isAxiosError(error)) {
        const status = error.response?.status;

        if (status === StatusCodes.NOT_FOUND) {
          throw new ChangesetNotFoundError(changesetId);
        }

        if (status === StatusCodes.CONFLICT) {
          throw new ChangesetCloseConflictError(changesetId);
        }
      }

      throw error;
    }
  }

  private serializeChangesetXml(request: ChangesetCreateRequest): string {
    const tagsXml = Object.entries(request.tags)
      .map(([key, value]) => `<tag k="${key}" v="${value}"/>`)
      .join('');

    return `
        <osm>
          <changeset version="0.6" generator=${SERVICE_NAME}>
            ${tagsXml}
          </changeset>
        </osm>`.trim();
  }
}
