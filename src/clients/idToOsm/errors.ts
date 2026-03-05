import { BaseError } from '../error';

export class IdConflictError extends BaseError {
  public constructor(message: string) {
    super(message);
  }
}
