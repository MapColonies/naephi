export abstract class BaseError extends Error {
  public readonly context?: Record<string, unknown>;

  public constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
    this.context = context;
  }
}
