import type { Logger } from '@map-colonies/js-logger';
import httpStatus from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import type { TypedRequestHandlers } from '@openapi';
import { SERVICES } from '@common/constants';
import { FlowManager } from '../models/flowManager';

@injectable()
export class FlowController {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(FlowManager) private readonly manager: FlowManager
  ) {}

  public initializeFlow: TypedRequestHandlers['POST /flow'] = async (req, res, next) => {
    const { type, ...payload } = req.body;

    try {
      await this.manager.initChangesetFlow(payload);

      return res.status(httpStatus.ACCEPTED).send();
    } catch (error) {
      return next(error);
    }
  };
}
