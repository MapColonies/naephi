import { isAxiosError } from 'axios';
import { StatusCodes } from 'http-status-codes';
import { injectable } from 'tsyringe';
import { BaseClient } from '../baseClient';
import type { ClientConfig } from '../options';
import { EntityBulkRequest, IIdToOsm } from './types';
import { IdAlreadyExistsError } from './errors';

@injectable()
export class IdToOsmClient extends BaseClient implements IIdToOsm {
  public constructor(clientConfig: ClientConfig) {
    super(clientConfig);
  }

  public async bulk(request: EntityBulkRequest): Promise<void> {
    const metadata = this.buildMetadata(request);
    this.logger?.info({ msg: 'executing entity bulk operation', ...metadata });

    try {
      await this.httpClient.post('/entity/bulk', request);
    } catch (error) {
      this.logError({ err: error, msg: 'entity bulk operation failed', metadata });

      if (isAxiosError(error)) {
        if (error.response?.status === StatusCodes.UNPROCESSABLE_ENTITY) {
          throw new IdAlreadyExistsError('externalId for creation already exists with different osmId');
        }
      }

      throw error;
    }
  }

  private buildMetadata(request: EntityBulkRequest): Record<string, unknown> {
    const isMulti = Array.isArray(request);
    return {
      bulkType: isMulti ? 'multi' : request.action,
      operations: isMulti ? request.map((operation) => operation.action) : [request.action],
      entityCount: isMulti ? request.reduce((acc, operation) => acc + operation.payload.length, 0) : request.payload.length,
    };
  }
}
