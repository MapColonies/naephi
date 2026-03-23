import { isAxiosError } from 'axios';
import { StatusCodes } from 'http-status-codes';
import { inject, injectable } from 'tsyringe';
import type { Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { SERVICES } from '@src/common/constants';
import type { ConfigType } from '@src/common/config';
import { BaseClient } from '../baseClient';
import type { ClientOptions } from '../options';
import { CLIENTS } from '../constants';
import { EntityBulkRequest, IIdToOsm } from './types';
import { IdConflictError } from './errors';

@injectable()
export class IdToOsmClient extends BaseClient implements IIdToOsm {
  public constructor(
    @inject(SERVICES.CONFIG) config: ConfigType,
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.METRICS) metricsRegistry: Registry
  ) {
    const options = config.get(`app.clients.${CLIENTS.ID_TO_OSM}`) as unknown as ClientOptions;
    const clientLogger = logger.child({ component: CLIENTS.ID_TO_OSM });
    super({ clientName: CLIENTS.ID_TO_OSM, ...options, logger: clientLogger, metricsRegistry });
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
          throw new IdConflictError('externalId for creation already exists with different osmId');
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
