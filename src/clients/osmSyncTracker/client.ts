import { BaseClient } from '../baseClient';
import { ClientConfig } from '../options';
import { Changeset, ChangesetPatchRequest, EntityPatchRequest, IOsmSyncTracker } from './types';

export class OsmSyncTrackerClient extends BaseClient implements IOsmSyncTracker {
  public constructor(clientConfig: ClientConfig) {
    super(clientConfig);
  }

  public async patchEntities(request: EntityPatchRequest): Promise<void> {
    const metadata = { entityCount: request.length };
    this.logger?.info({ msg: 'executing entity patching', ...metadata });

    try {
      await this.httpClient.patch('/entity/_bulk', request);
    } catch (error) {
      this.logError({ err: error, msg: 'failed to patch entities bulk', metadata });
      throw error;
    }
  }

  public async createChangeset(request: Changeset): Promise<void> {
    this.logger?.info({ msg: 'executing changeset creation', request });

    try {
      await this.httpClient.post('/changeset', request);
    } catch (error) {
      this.logError({ err: error, msg: 'failed to create changeset', metadata: { request } });
      throw error;
    }
  }

  public async updateChangeset(changesetId: string, request: ChangesetPatchRequest): Promise<void> {
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

  public async createChangesetClosureJobs(changesetIds: string[]): Promise<void> {
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
