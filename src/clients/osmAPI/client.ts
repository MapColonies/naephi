import { isAxiosError } from 'axios';
import { StatusCodes } from 'http-status-codes';
import { inject, injectable } from 'tsyringe';
import type { Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { SERVICE_NAME, SERVICES } from '@src/common/constants';
import type { ConfigType } from '@src/common/config';
import { BaseClient } from '../baseClient';
import type { ClientOptions } from '../options';
import { CLIENTS } from '../constants';
import { ChangesetCreateRequest, IOsmAPI, OsmChangesetResponse } from './types';
import {
  ChangesetAlreadyClosedError,
  ChangesetCloseConflictError,
  ChangesetNotFoundError,
  ChangesetContentConflictError,
  ChangesetPayloadError,
  ChangesetTooLargeError,
  ChangesetElementGoneError,
  ChangesetPreconditionError,
} from './errors';

@injectable()
export class OsmApiClient extends BaseClient implements IOsmAPI {
  public constructor(
    @inject(SERVICES.CONFIG) config: ConfigType,
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.METRICS) metricsRegistry: Registry
  ) {
    const options = config.get(`app.clients.${CLIENTS.OSM_API}`) as unknown as ClientOptions;
    const clientLogger = logger.child({ component: CLIENTS.OSM_API });
    super({ clientName: CLIENTS.OSM_API, ...options, logger: clientLogger, metricsRegistry });
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
        throw new Error(`Invalid response from OSM API: ${response.data}`);
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

  public async uploadChangeset(changesetId: number, osmChangeXml: string): Promise<void> {
    this.logger?.info({ msg: 'executing osm changeset upload', changesetId });

    try {
      await this.httpClient.post<unknown>(`/api/0.6/changeset/${changesetId}/upload`, osmChangeXml, {
        headers: { 'Content-Type': 'text/xml' },
        responseType: 'text',
      });
    } catch (error) {
      this.logError({ err: error, msg: 'failed changeset upload', metadata: { changesetId } });

      if (isAxiosError(error) && error.response?.status !== undefined) {
        const status = error.response.status as StatusCodes;
        const responseBody = typeof error.response.data === 'string' ? error.response.data : 'request failed';

        // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
        switch (status) {
          case StatusCodes.BAD_REQUEST:
            throw new ChangesetPayloadError(changesetId, responseBody);

          case StatusCodes.NOT_FOUND:
            throw new ChangesetNotFoundError(changesetId, responseBody);

          case StatusCodes.CONFLICT:
            if (responseBody.includes('closed at')) {
              throw new ChangesetAlreadyClosedError(changesetId, responseBody);
            }
            throw new ChangesetContentConflictError(changesetId, responseBody);

          case StatusCodes.GONE:
            throw new ChangesetElementGoneError(changesetId, responseBody);

          case StatusCodes.PRECONDITION_FAILED:
            throw new ChangesetPreconditionError(changesetId, responseBody);

          case StatusCodes.REQUEST_TOO_LONG:
            throw new ChangesetTooLargeError(changesetId, responseBody);

          default:
            throw error;
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
