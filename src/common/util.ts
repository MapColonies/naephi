export const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`promise timed out after ${ms}ms`)), ms));
  return Promise.race([promise, timeout]);
};
