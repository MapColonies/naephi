import { injectable } from 'tsyringe';
import { isAxiosError } from 'axios';
import { StatusCodes } from 'http-status-codes';
import { BaseClient } from '../baseClient';
import type { ClientConfig } from '../options';
import { Changeset, ChangesetPatchRequest, PatchEntitiesRequest, IOsmSyncTracker } from './types';

@injectable()
export class OsmSyncTrackerClient extends BaseClient implements IOsmSyncTracker {
  public constructor(clientConfig: ClientConfig) {
    super(clientConfig);
  }

  public async patchEntities(request: PatchEntitiesRequest): Promise<void> {
    const metadata = { entityCount: request.length };
    this.logger?.info({ msg: 'executing entity patching', ...metadata });

    try {
      await this.httpClient.patch('/entity/_bulk', request);
    } catch (error) {
      this.logError({ err: error, msg: 'failed to patch entities bulk', metadata });
      throw error;
    }
  }

  public async postChangeset(request: Changeset): Promise<void> {
    this.logger?.info({ msg: 'executing changeset creation', request });

    try {
      await this.httpClient.post('/changeset', request);
    } catch (error) {
      this.logError({ err: error, msg: 'failed to create changeset', metadata: { request } });
      throw error;
    }
  }

  public async getChangeset(changesetId: string): Promise<Changeset | null> {
    this.logger?.info({ msg: 'executing changeset get', changesetId });

    try {
      const response = await this.httpClient.get<Changeset>(`/changeset/${changesetId}`);
      return response.data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === StatusCodes.NOT_FOUND) {
        return null;
      }
      this.logError({ err: error, msg: 'failed to get changeset', metadata: { changesetId } });
      throw error;
    }
  }

  public async patchChangeset(changesetId: string, request: ChangesetPatchRequest): Promise<void> {
    this.logger?.info({ msg: 'executing changeset update', changesetId, request });

    try {
      await this.httpClient.patch(`/changeset/${changesetId}`, request);
    } catch (error) {
      this.logError({ err: error, msg: 'failed to update changeset', metadata: { changesetId, request } });
      throw error;
    }
  }

  public async closeChangesetEntities(changesetId: string): Promise<void> {
    this.logger?.info({ msg: 'executing changeset entities closure', changesetId });

    try {
      await this.httpClient.patch(`/changeset/${changesetId}/entities`);
    } catch (error) {
      this.logError({ err: error, msg: 'failed to close changeset entities', metadata: { changesetId } });
      throw error;
    }
  }

  public async postChangesetClosureJobs(changesetIds: string[]): Promise<void> {
    const metadata = { countChangesets: changesetIds.length };
    this.logger?.info({ msg: 'executing changeset closure jobs creation', metadata });

    try {
      await this.httpClient.post('/changeset/closure', changesetIds);
    } catch (error) {
      this.logError({ err: error, msg: 'failed to create closure jobs', metadata });
      throw error;
    }
  }
}
