import { BaseError } from '../error';

export class IdAlreadyExistsError extends BaseError {
  public constructor(message: string) {
    super(message);
  }
}
