import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { FlowController } from '../controllers/flowController';

export const FLOW_ROUTER_SYMBOL = Symbol('flowRouterFactory');

export const flowRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(FlowController);

  router.post('/', controller.initializeFlow);

  return router;
};
