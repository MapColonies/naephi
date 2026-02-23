export interface ErrorContext {
  err: unknown;
  msg: string;
  metadata?: Record<string, unknown>;
}

export abstract class BaseError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
  }
}
