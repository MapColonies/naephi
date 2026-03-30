import { Job } from 'bullmq';

export interface BufferedJob<T, N extends string> {
  job: Job<T, void, N>;
  resolve: () => void;
  reject: (err: Error) => void;
}
