/**
 * Base class for all business logic errors in beebear.
 *
 * All beebear error classes extend this. Catching `BusinessError`
 * catches any business-level error thrown by a use case.
 */
export class BusinessError extends Error {
  readonly code: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code ?? this.constructor.name;
  }
}

/** Input data fails business rule validation. Default HTTP mapping: 400. */
export class ValidationError extends BusinessError {
  constructor(message: string, code?: string) {
    super(message, code ?? 'ValidationError');
    this.name = 'ValidationError';
  }
}

/** Requested entity does not exist. Default HTTP mapping: 404. */
export class NotFoundError extends BusinessError {
  constructor(message: string, code?: string) {
    super(message, code ?? 'NotFoundError');
    this.name = 'NotFoundError';
  }
}

/** Operation conflicts with current state. Default HTTP mapping: 409. */
export class ConflictError extends BusinessError {
  constructor(message: string, code?: string) {
    super(message, code ?? 'ConflictError');
    this.name = 'ConflictError';
  }
}

/** Caller is not authenticated. Default HTTP mapping: 401. */
export class UnauthorizedError extends BusinessError {
  constructor(message: string, code?: string) {
    super(message, code ?? 'UnauthorizedError');
    this.name = 'UnauthorizedError';
  }
}

/** Caller is authenticated but lacks permission. Default HTTP mapping: 403. */
export class ForbiddenError extends BusinessError {
  constructor(message: string, code?: string) {
    super(message, code ?? 'ForbiddenError');
    this.name = 'ForbiddenError';
  }
}
