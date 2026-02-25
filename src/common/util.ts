export type Result<T, E = Error> = { data: T; error?: never } | { data?: never; error: E };

export const attemptSafely = async <T, E = Error>(fn: () => Promise<T>): Promise<Result<T, E>> => {
  try {
    const data = await fn();
    return { data };
  } catch (error) {
    return { error: error as E };
  }
};

export const hasErrored = <T, E>(result: Result<T, E>): result is { data?: never; error: E } => {
  return result.error !== undefined;
};
