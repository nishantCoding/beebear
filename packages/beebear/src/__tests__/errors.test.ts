import { describe, it, expect } from 'vitest';
import {
  BusinessError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
} from '../errors.js';

describe('BusinessError', () => {
  it('extends Error', () => {
    const err = new BusinessError('something broke');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BusinessError);
  });

  it('sets message', () => {
    const err = new BusinessError('something broke');
    expect(err.message).toBe('something broke');
  });

  it('defaults code to class name', () => {
    const err = new BusinessError('something broke');
    expect(err.code).toBe('BusinessError');
  });

  it('allows custom code', () => {
    const err = new BusinessError('broke', 'CUSTOM_CODE');
    expect(err.code).toBe('CUSTOM_CODE');
  });

  it('sets name to class name', () => {
    const err = new BusinessError('broke');
    expect(err.name).toBe('BusinessError');
  });

  it('captures a stack trace', () => {
    const err = new BusinessError('broke');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('BusinessError');
  });
});

describe('ValidationError', () => {
  it('extends BusinessError and Error', () => {
    const err = new ValidationError('bad input');
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).toBeInstanceOf(BusinessError);
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults code to ValidationError', () => {
    const err = new ValidationError('bad input');
    expect(err.code).toBe('ValidationError');
  });

  it('allows custom code', () => {
    const err = new ValidationError('bad', 'INVALID_EMAIL');
    expect(err.code).toBe('INVALID_EMAIL');
  });

  it('sets name to ValidationError', () => {
    const err = new ValidationError('bad');
    expect(err.name).toBe('ValidationError');
  });
});

describe('NotFoundError', () => {
  it('extends BusinessError and Error', () => {
    const err = new NotFoundError('user not found');
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toBeInstanceOf(BusinessError);
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults code to NotFoundError', () => {
    const err = new NotFoundError('not found');
    expect(err.code).toBe('NotFoundError');
  });

  it('allows custom code', () => {
    const err = new NotFoundError('missing', 'USER_NOT_FOUND');
    expect(err.code).toBe('USER_NOT_FOUND');
  });

  it('sets name to NotFoundError', () => {
    const err = new NotFoundError('not found');
    expect(err.name).toBe('NotFoundError');
  });
});

describe('ConflictError', () => {
  it('extends BusinessError and Error', () => {
    const err = new ConflictError('already exists');
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toBeInstanceOf(BusinessError);
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults code to ConflictError', () => {
    const err = new ConflictError('conflict');
    expect(err.code).toBe('ConflictError');
  });

  it('allows custom code', () => {
    const err = new ConflictError('exists', 'USER_ALREADY_EXISTS');
    expect(err.code).toBe('USER_ALREADY_EXISTS');
  });

  it('sets name to ConflictError', () => {
    const err = new ConflictError('conflict');
    expect(err.name).toBe('ConflictError');
  });
});

describe('UnauthorizedError', () => {
  it('extends BusinessError and Error', () => {
    const err = new UnauthorizedError('not authenticated');
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err).toBeInstanceOf(BusinessError);
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults code to UnauthorizedError', () => {
    const err = new UnauthorizedError('no token');
    expect(err.code).toBe('UnauthorizedError');
  });

  it('allows custom code', () => {
    const err = new UnauthorizedError('expired', 'TOKEN_EXPIRED');
    expect(err.code).toBe('TOKEN_EXPIRED');
  });

  it('sets name to UnauthorizedError', () => {
    const err = new UnauthorizedError('no auth');
    expect(err.name).toBe('UnauthorizedError');
  });
});

describe('ForbiddenError', () => {
  it('extends BusinessError and Error', () => {
    const err = new ForbiddenError('not allowed');
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err).toBeInstanceOf(BusinessError);
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults code to ForbiddenError', () => {
    const err = new ForbiddenError('forbidden');
    expect(err.code).toBe('ForbiddenError');
  });

  it('allows custom code', () => {
    const err = new ForbiddenError('nope', 'ADMIN_ONLY');
    expect(err.code).toBe('ADMIN_ONLY');
  });

  it('sets name to ForbiddenError', () => {
    const err = new ForbiddenError('nope');
    expect(err.name).toBe('ForbiddenError');
  });
});

describe('hierarchy — catching BusinessError catches all subclasses', () => {
  it('catch block with BusinessError catches ValidationError', () => {
    let caught = false;
    try {
      throw new ValidationError('bad');
    } catch (err) {
      if (err instanceof BusinessError) caught = true;
    }
    expect(caught).toBe(true);
  });

  it('catch block with BusinessError catches NotFoundError', () => {
    let caught = false;
    try {
      throw new NotFoundError('missing');
    } catch (err) {
      if (err instanceof BusinessError) caught = true;
    }
    expect(caught).toBe(true);
  });
});

describe('extending for app-specific errors', () => {
  class UserAlreadyExistsError extends ConflictError {
    constructor(email: string) {
      super(`User with email "${email}" already exists`, 'USER_ALREADY_EXISTS');
    }
  }

  it('custom error extends the hierarchy', () => {
    const err = new UserAlreadyExistsError('ada@example.com');
    expect(err).toBeInstanceOf(UserAlreadyExistsError);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toBeInstanceOf(BusinessError);
    expect(err).toBeInstanceOf(Error);
  });

  it('custom error has correct message and code', () => {
    const err = new UserAlreadyExistsError('ada@example.com');
    expect(err.message).toBe('User with email "ada@example.com" already exists');
    expect(err.code).toBe('USER_ALREADY_EXISTS');
  });

  it('custom error constructor.name matches class name', () => {
    const err = new UserAlreadyExistsError('ada@example.com');
    expect(err.constructor.name).toBe('UserAlreadyExistsError');
  });
});
