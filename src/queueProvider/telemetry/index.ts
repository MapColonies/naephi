import { BullMQOtel } from 'bullmq-otel';
import { SNAKED_SERVICE_NAME } from '@src/common/constants';

export const bullMqOtelFactory = (component?: string): BullMQOtel => {
  const tracerName = `${SNAKED_SERVICE_NAME}_bullmq${component ?? `_${component}`}`;
  return new BullMQOtel(tracerName);
};
