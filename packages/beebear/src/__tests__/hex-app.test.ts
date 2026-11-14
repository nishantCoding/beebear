import { describe, it, expect } from 'vitest';
import { createHexApp } from '../hex-app.js';
import { createContainer } from '../container.js';
import { Port } from '../port.js';
import {
  BusinessError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
} from '../errors.js';
import type { UseCase } from '../use-case.js';

// ---- Test fixtures ----

interface GreetInput { name: string }
interface GreetOutput { message: string }

interface GreetUseCase extends UseCase<GreetInput, GreetOutput> {}
const GreetUseCase = Port<GreetUseCase>('GreetUseCase');

class GreetService implements GreetUseCase {
  async execute(input: GreetInput): Promise<GreetOutput> {
    return { message: `Hello, ${input.name}!` };
  }
}

interface DeleteInput { id: string }
interface DeleteUseCase extends UseCase<DeleteInput, void> {}
const DeleteUseCase = Port<DeleteUseCase>('DeleteUseCase');

class DeleteService implements DeleteUseCase {
  async execute(_input: DeleteInput): Promise<void> {
    // no-op
  }
}

// Use case that throws various errors
interface FailingUseCase extends UseCase<{ type: string }, never> {}
const FailingUseCase = Port<FailingUseCase>('FailingUseCase');

class FailingService implements FailingUseCase {
  async execute(input: { type: string }): Promise<never> {
    switch (input.type) {
      case 'validation':
        throw new ValidationError('Invalid input');
      case 'notfound':
        throw new NotFoundError('Not found');
      case 'conflict':
        throw new ConflictError('Already exists');
      case 'unauthorized':
        throw new UnauthorizedError('Not authenticated');
      case 'forbidden':
        throw new ForbiddenError('Not allowed');
      case 'business':
        throw new BusinessError('Generic business error');
      case 'type-error':
        throw new TypeError('Something broke');
      case 'plain-error':
        throw new Error('Unexpected failure');
      default:
        throw new BusinessError('Unknown');
    }
  }
}

// Custom app-specific error
class UserAlreadyExistsError extends ConflictError {
  constructor(email: string) {
    super(`User with email "${email}" already exists`, 'USER_ALREADY_EXISTS');
  }
}

// Custom error not in error map
class CustomBusinessError extends BusinessError {
  constructor() {
    super('Custom error', 'CUSTOM');
  }
}

interface CustomErrorUseCase extends UseCase<{ type: string }, never> {}
const CustomErrorUseCase = Port<CustomErrorUseCase>('CustomErrorUseCase');

class CustomErrorService implements CustomErrorUseCase {
  async execute(input: { type: string }): Promise<never> {
    if (input.type === 'user-exists') {
      throw new UserAlreadyExistsError('ada@example.com');
    }
    throw new CustomBusinessError();
  }
}

// ---- Tests ----

describe('createHexApp', () => {
  it('returns an object with an execute method', () => {
    const container = createContainer();
    const hex = createHexApp({ container });
    expect(typeof hex.execute).toBe('function');
  });
});

describe('hex.execute()', () => {
  describe('success path', () => {
    it('resolves use case from container and returns result', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container });

      const result = await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(result).toEqual({
        success: true,
        data: { message: 'Hello, Alice!' },
      });
    });

    it('result.success is true on success', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container });

      const result = await hex.execute(GreetUseCase, { name: 'Bob' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBe('Hello, Bob!');
      }
    });

    it('passes input through to the use case unchanged', async () => {
      interface EchoUseCase extends UseCase<{ value: number }, { value: number }> {}
      const EchoUseCase = Port<EchoUseCase>('EchoUseCase');

      const container = createContainer();
      container.bind(EchoUseCase, () => ({
        async execute(input: { value: number }) {
          return { value: input.value };
        },
      }));
      const hex = createHexApp({ container });

      const result = await hex.execute(EchoUseCase, { value: 42 });

      expect(result).toEqual({ success: true, data: { value: 42 } });
    });
  });

  describe('void output', () => {
    it('returns { success: true, data: undefined } for void use cases', async () => {
      const container = createContainer();
      container.bind(DeleteUseCase, () => new DeleteService());
      const hex = createHexApp({ container });

      const result = await hex.execute(DeleteUseCase, { id: '1' });

      expect(result).toEqual({ success: true, data: undefined });
    });
  });

  describe('business error handling', () => {
    function setupFailingHex() {
      const container = createContainer();
      container.bind(FailingUseCase, () => new FailingService());
      return createHexApp({ container });
    }

    it('catches ValidationError and returns status 400', async () => {
      const hex = setupFailingHex();
      const result = await hex.execute(FailingUseCase, { type: 'validation' });

      expect(result).toEqual({
        success: false,
        error: { message: 'Invalid input', code: 'ValidationError' },
        statusCode: 400,
      });
    });

    it('catches NotFoundError and returns status 404', async () => {
      const hex = setupFailingHex();
      const result = await hex.execute(FailingUseCase, { type: 'notfound' });

      expect(result).toEqual({
        success: false,
        error: { message: 'Not found', code: 'NotFoundError' },
        statusCode: 404,
      });
    });

    it('catches ConflictError and returns status 409', async () => {
      const hex = setupFailingHex();
      const result = await hex.execute(FailingUseCase, { type: 'conflict' });

      expect(result).toEqual({
        success: false,
        error: { message: 'Already exists', code: 'ConflictError' },
        statusCode: 409,
      });
    });

    it('catches UnauthorizedError and returns status 401', async () => {
      const hex = setupFailingHex();
      const result = await hex.execute(FailingUseCase, { type: 'unauthorized' });

      expect(result).toEqual({
        success: false,
        error: { message: 'Not authenticated', code: 'UnauthorizedError' },
        statusCode: 401,
      });
    });

    it('catches ForbiddenError and returns status 403', async () => {
      const hex = setupFailingHex();
      const result = await hex.execute(FailingUseCase, { type: 'forbidden' });

      expect(result).toEqual({
        success: false,
        error: { message: 'Not allowed', code: 'ForbiddenError' },
        statusCode: 403,
      });
    });

    it('catches BusinessError and returns status 400', async () => {
      const hex = setupFailingHex();
      const result = await hex.execute(FailingUseCase, { type: 'business' });

      expect(result).toEqual({
        success: false,
        error: { message: 'Generic business error', code: 'BusinessError' },
        statusCode: 400,
      });
    });

    it('includes error message and code in the result', async () => {
      const hex = setupFailingHex();
      const result = await hex.execute(FailingUseCase, { type: 'validation' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Invalid input');
        expect(result.error.code).toBe('ValidationError');
        expect(typeof result.statusCode).toBe('number');
      }
    });
  });

  describe('non-business errors re-thrown', () => {
    function setupFailingHex() {
      const container = createContainer();
      container.bind(FailingUseCase, () => new FailingService());
      return createHexApp({ container });
    }

    it('re-throws TypeError', async () => {
      const hex = setupFailingHex();
      await expect(hex.execute(FailingUseCase, { type: 'type-error' }))
        .rejects.toThrow(TypeError);
    });

    it('re-throws plain Error', async () => {
      const hex = setupFailingHex();
      await expect(hex.execute(FailingUseCase, { type: 'plain-error' }))
        .rejects.toThrow('Unexpected failure');
    });

    it('re-throws non-BusinessError with original message', async () => {
      const hex = setupFailingHex();
      await expect(hex.execute(FailingUseCase, { type: 'type-error' }))
        .rejects.toThrow('Something broke');
    });
  });

  describe('token resolution failure', () => {
    it('re-throws when token has no binding', async () => {
      interface UnboundUseCase extends UseCase<void, void> {}
      const UnboundUseCase = Port<UnboundUseCase>('UnboundUseCase');

      const container = createContainer();
      const hex = createHexApp({ container });

      await expect(hex.execute(UnboundUseCase, undefined as void))
        .rejects.toThrow(/No binding/);
    });
  });

  describe('error map merging', () => {
    it('developer errorMap overrides defaults', async () => {
      const container = createContainer();
      container.bind(FailingUseCase, () => new FailingService());
      const hex = createHexApp({
        container,
        errorMap: { ValidationError: 422 },
      });

      const result = await hex.execute(FailingUseCase, { type: 'validation' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(422);
      }
    });

    it('non-overridden defaults remain intact', async () => {
      const container = createContainer();
      container.bind(FailingUseCase, () => new FailingService());
      const hex = createHexApp({
        container,
        errorMap: { ValidationError: 422 },
      });

      // NotFoundError should still be 404 (not overridden)
      const result = await hex.execute(FailingUseCase, { type: 'notfound' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
      }
    });

    it('app-specific errors can be added to errorMap', async () => {
      const container = createContainer();
      container.bind(CustomErrorUseCase, () => new CustomErrorService());
      const hex = createHexApp({
        container,
        errorMap: { UserAlreadyExistsError: 409 },
      });

      const result = await hex.execute(CustomErrorUseCase, { type: 'user-exists' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(409);
        expect(result.error.message).toBe('User with email "ada@example.com" already exists');
        expect(result.error.code).toBe('USER_ALREADY_EXISTS');
      }
    });

    it('unmapped BusinessError subclass falls back to 400', async () => {
      const container = createContainer();
      container.bind(CustomErrorUseCase, () => new CustomErrorService());
      const hex = createHexApp({ container });

      const result = await hex.execute(CustomErrorUseCase, { type: 'custom' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
      }
    });
  });

  describe('error map immutability', () => {
    it('mutating the original errorMap object has no effect after creation', async () => {
      const container = createContainer();
      container.bind(FailingUseCase, () => new FailingService());

      const errorMap: Record<string, number> = { ValidationError: 422 };
      const hex = createHexApp({ container, errorMap });

      // Mutate the original object after creation
      errorMap.ValidationError = 500;

      const result = await hex.execute(FailingUseCase, { type: 'validation' });

      expect(result.success).toBe(false);
      if (!result.success) {
        // Should still be 422, not 500
        expect(result.statusCode).toBe(422);
      }
    });
  });

  describe('no errorMap provided', () => {
    it('uses defaults when errorMap is omitted', async () => {
      const container = createContainer();
      container.bind(FailingUseCase, () => new FailingService());
      const hex = createHexApp({ container });

      const result = await hex.execute(FailingUseCase, { type: 'notfound' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
      }
    });
  });
});
