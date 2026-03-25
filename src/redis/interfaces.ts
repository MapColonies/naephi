export interface IRedisClient {
  get: <T>(key: string) => Promise<T | null>;
  delete: (key: string) => Promise<void>;
  deleteBatch: (keys: string[]) => Promise<void>;
  ping: () => Promise<boolean>;
}
