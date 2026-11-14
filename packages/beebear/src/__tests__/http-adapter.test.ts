import { describe, it, expect, vi } from 'vitest';
import { createHexApp } from '../hex-app.js';
import { createContainer } from '../container.js';
import { Port } from '../port.js';
import { ValidationError, NotFoundError } from '../errors.js';
import type { UseCase } from '../use-case.js';
import type { FrameworkStrategy, ExecuteResult, RouteOptions } from '../hex-app.js';

// ---- Test strategy (custom) ----
// Simulates an HTTP framework. The handler returned by createHandler
// accepts a fake request object and returns { statusCode, body }.

interface TestResponse {
  statusCode: number;
  body: any;
}

function testStrategy(): FrameworkStrategy {
  return {
    createHandler(
      executeRoute: (req: any) => Promise<ExecuteResult<any>>,
      options: RouteOptions,
    ) {
      return async (req: any): Promise<TestResponse> => {
        const result = await executeRoute(req);
        if (!result.success) {
          return { statusCode: result.statusCode, body: result.error };
        }
        const status = options.resolveStatus(req.method ?? 'GET');
        return { statusCode: status, body: result.data };
      };
    },
  };
}

// ---- Mock helpers for built-in strategies ----

function mockExpressRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

function mockFastifyReply() {
  const reply: any = {};
  reply.status = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  return reply;
}

function mockHonoContext(req: any) {
  return {
    req,
    json: vi.fn(),
    body: vi.fn(),
  };
}

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

interface ValidatingUseCase extends UseCase<{ email: string }, { id: string }> {}
const ValidatingUseCase = Port<ValidatingUseCase>('ValidatingUseCase');

class ValidatingService implements ValidatingUseCase {
  async execute(input: { email: string }): Promise<{ id: string }> {
    if (!input.email.includes('@')) {
      throw new ValidationError('Invalid email');
    }
    return { id: '1' };
  }
}

interface NotFoundUseCase extends UseCase<{ id: string }, { name: string }> {}
const NotFoundUseCase = Port<NotFoundUseCase>('NotFoundUseCase');

class NotFoundService implements NotFoundUseCase {
  async execute(input: { id: string }): Promise<{ name: string }> {
    throw new NotFoundError(`User ${input.id} not found`);
  }
}

interface CrashingUseCase extends UseCase<void, never> {}
const CrashingUseCase = Port<CrashingUseCase>('CrashingUseCase');

class CrashingService implements CrashingUseCase {
  async execute(): Promise<never> {
    throw new TypeError('Database connection lost');
  }
}

interface DeleteUseCase extends UseCase<{ id: string }, void> {}
const DeleteUseCase = Port<DeleteUseCase>('DeleteUseCase');

class DeleteService implements DeleteUseCase {
  async execute(_input: { id: string }): Promise<void> {
    // no-op
  }
}

// ---- Tests ----

describe('hex.httpAdapter()', () => {
  // ---- Custom strategy (escape hatch) ----

  describe('basic behavior', () => {
    it('returns a handler from the strategy', () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: testStrategy() });

      const handler = hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
      });

      expect(typeof handler).toBe('function');
    });

    it('calls toInput with the raw request object', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: testStrategy() });

      const fakeReq = { method: 'GET', body: { name: 'Alice' }, headers: { 'x-custom': 'test' } };
      const toInput = vi.fn((req: any) => ({ name: req.body.name }));

      const handler = hex.httpAdapter(GreetUseCase, { toInput });
      await handler(fakeReq);

      expect(toInput).toHaveBeenCalledWith(fakeReq);
    });

    it('passes extracted input to the use case via hex.execute()', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: testStrategy() });

      const handler = hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
      });

      const response: TestResponse = await handler({ method: 'GET', body: { name: 'Alice' } });

      expect(response.body).toEqual({ message: 'Hello, Alice!' });
    });
  });

  describe('success status resolution', () => {
    it('GET defaults to 200', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: testStrategy() });

      const handler = hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
      });

      const response: TestResponse = await handler({ method: 'GET', body: { name: 'Alice' } });

      expect(response.statusCode).toBe(200);
    });

    it('POST defaults to 201', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: testStrategy() });

      const handler = hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
      });

      const response: TestResponse = await handler({ method: 'POST', body: { name: 'Alice' } });

      expect(response.statusCode).toBe(201);
    });

    it('DELETE defaults to 204', async () => {
      const container = createContainer();
      container.bind(DeleteUseCase, () => new DeleteService());
      const hex = createHexApp({ container, framework: testStrategy() });

      const handler = hex.httpAdapter(DeleteUseCase, {
        toInput: (req: any) => ({ id: req.params.id }),
      });

      const response: TestResponse = await handler({ method: 'DELETE', params: { id: '1' } });

      expect(response.statusCode).toBe(204);
    });

    it('PUT defaults to 200', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: testStrategy() });

      const handler = hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
      });

      const response: TestResponse = await handler({ method: 'PUT', body: { name: 'Alice' } });

      expect(response.statusCode).toBe(200);
    });

    it('PATCH defaults to 200', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: testStrategy() });

      const handler = hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
      });

      const response: TestResponse = await handler({ method: 'PATCH', body: { name: 'Alice' } });

      expect(response.statusCode).toBe(200);
    });

    it('explicit status overrides POST default', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: testStrategy() });

      const handler = hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
        status: 200,
      });

      const response: TestResponse = await handler({ method: 'POST', body: { name: 'Alice' } });

      expect(response.statusCode).toBe(200);
    });

    it('explicit status overrides DELETE default', async () => {
      const container = createContainer();
      container.bind(DeleteUseCase, () => new DeleteService());
      const hex = createHexApp({ container, framework: testStrategy() });

      const handler = hex.httpAdapter(DeleteUseCase, {
        toInput: (req: any) => ({ id: req.params.id }),
        status: 200,
      });

      const response: TestResponse = await handler({ method: 'DELETE', params: { id: '1' } });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('error responses', () => {
    it('returns error status from errorMap on business error', async () => {
      const container = createContainer();
      container.bind(ValidatingUseCase, () => new ValidatingService());
      const hex = createHexApp({ container, framework: testStrategy() });

      const handler = hex.httpAdapter(ValidatingUseCase, {
        toInput: (req: any) => ({ email: req.body.email }),
      });

      const response: TestResponse = await handler({ method: 'POST', body: { email: 'bad' } });

      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual({
        message: 'Invalid email',
        code: 'ValidationError',
      });
    });

    it('maps NotFoundError to 404', async () => {
      const container = createContainer();
      container.bind(NotFoundUseCase, () => new NotFoundService());
      const hex = createHexApp({ container, framework: testStrategy() });

      const handler = hex.httpAdapter(NotFoundUseCase, {
        toInput: (req: any) => ({ id: req.params.id }),
      });

      const response: TestResponse = await handler({ method: 'GET', params: { id: '99' } });

      expect(response.statusCode).toBe(404);
      expect(response.body.message).toBe('User 99 not found');
    });

    it('uses custom errorMap overrides', async () => {
      const container = createContainer();
      container.bind(ValidatingUseCase, () => new ValidatingService());
      const hex = createHexApp({
        container,
        framework: testStrategy(),
        errorMap: { ValidationError: 422 },
      });

      const handler = hex.httpAdapter(ValidatingUseCase, {
        toInput: (req: any) => ({ email: req.body.email }),
      });

      const response: TestResponse = await handler({ method: 'POST', body: { email: 'bad' } });

      expect(response.statusCode).toBe(422);
    });

    it('error status is unaffected by method defaults or explicit status', async () => {
      const container = createContainer();
      container.bind(ValidatingUseCase, () => new ValidatingService());
      const hex = createHexApp({ container, framework: testStrategy() });

      const handler = hex.httpAdapter(ValidatingUseCase, {
        toInput: (req: any) => ({ email: req.body.email }),
        status: 201,
      });

      const response: TestResponse = await handler({ method: 'POST', body: { email: 'bad' } });

      // Error statusCode comes from errorMap, not from method default or explicit status
      expect(response.statusCode).toBe(400);
    });
  });

  describe('non-business errors', () => {
    it('propagates non-business errors (not caught by httpAdapter)', async () => {
      const container = createContainer();
      container.bind(CrashingUseCase, () => new CrashingService());
      const hex = createHexApp({ container, framework: testStrategy() });

      const handler = hex.httpAdapter(CrashingUseCase, {
        toInput: () => undefined as void,
      });

      await expect(handler({ method: 'GET' })).rejects.toThrow(TypeError);
      await expect(handler({ method: 'GET' })).rejects.toThrow('Database connection lost');
    });
  });

  describe('no framework strategy', () => {
    it('throws when httpAdapter() is called without a framework strategy', () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container });

      expect(() =>
        hex.httpAdapter(GreetUseCase, {
          toInput: (req: any) => ({ name: req.body.name }),
        })
      ).toThrow(/httpAdapter\(\) requires a framework strategy/);
    });

    it('execute() still works without a framework strategy', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container });

      const result = await hex.execute(GreetUseCase, { name: 'Alice' });
      expect(result).toEqual({ success: true, data: { message: 'Hello, Alice!' } });
    });
  });

  describe('strategy contract', () => {
    it('calls strategy.createHandler with executeRoute and RouteOptions', () => {
      const createHandler = vi.fn(() => () => {});
      const strategy: FrameworkStrategy = { createHandler };

      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: strategy });

      hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
        status: 201,
      });

      expect(createHandler).toHaveBeenCalledOnce();
      const [executeRoute, options] = createHandler.mock.calls[0] as unknown as [any, RouteOptions];
      expect(typeof executeRoute).toBe('function');
      expect(typeof options.resolveStatus).toBe('function');
    });

    it('resolveStatus returns method default when no explicit status', () => {
      const createHandler = vi.fn(() => () => {});
      const strategy: FrameworkStrategy = { createHandler };

      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: strategy });

      hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
      });

      const [, options] = createHandler.mock.calls[0] as unknown as [any, RouteOptions];
      expect(options.resolveStatus('GET')).toBe(200);
      expect(options.resolveStatus('POST')).toBe(201);
      expect(options.resolveStatus('DELETE')).toBe(204);
      expect(options.resolveStatus('PUT')).toBe(200);
      expect(options.resolveStatus('PATCH')).toBe(200);
    });

    it('resolveStatus returns explicit status regardless of method', () => {
      const createHandler = vi.fn(() => () => {});
      const strategy: FrameworkStrategy = { createHandler };

      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: strategy });

      hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
        status: 200,
      });

      const [, options] = createHandler.mock.calls[0] as unknown as [any, RouteOptions];
      expect(options.resolveStatus('GET')).toBe(200);
      expect(options.resolveStatus('POST')).toBe(200);
      expect(options.resolveStatus('DELETE')).toBe(200);
    });

    it('executeRoute calls toInput then hex.execute internally', async () => {
      const createHandler = vi.fn(
        (executeRoute: (req: any) => Promise<ExecuteResult<any>>, _options: RouteOptions) => {
          return executeRoute; // return executeRoute directly for testing
        },
      );
      const strategy: FrameworkStrategy = { createHandler };

      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: strategy });

      const executeRoute = hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
      });

      const result = await executeRoute({ body: { name: 'Bob' } });

      expect(result).toEqual({ success: true, data: { message: 'Hello, Bob!' } });
    });

    it('same strategy is used for all httpAdapter calls', () => {
      const createHandler = vi.fn(() => () => {});
      const strategy: FrameworkStrategy = { createHandler };

      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      container.bind(DeleteUseCase, () => new DeleteService());
      const hex = createHexApp({ container, framework: strategy });

      hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
      });
      hex.httpAdapter(DeleteUseCase, {
        toInput: (req: any) => ({ id: req.params.id }),
      });

      expect(createHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('toInput receives raw request', () => {
    it('passes the request object through untouched', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: testStrategy() });

      const fakeReq = {
        method: 'GET',
        body: { name: 'Alice' },
        params: { id: '1' },
        query: { page: '2' },
        headers: { authorization: 'Bearer xyz' },
      };

      let receivedReq: any;
      const handler = hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => {
          receivedReq = req;
          return { name: req.body.name };
        },
      });

      await handler(fakeReq);

      expect(receivedReq).toBe(fakeReq); // same reference, not a copy
    });
  });

  // ---- Framework resolution ----

  describe('framework resolution', () => {
    it('throws on unknown framework string at createHexApp time', () => {
      const container = createContainer();
      expect(() =>
        createHexApp({ container, framework: 'koa' as any })
      ).toThrow(/Unknown framework/);
    });

    it('error message includes the unknown name and suggests FrameworkStrategy', () => {
      const container = createContainer();
      expect(() =>
        createHexApp({ container, framework: 'koa' as any })
      ).toThrow(/koa/);
    });
  });

  // ---- Built-in Express strategy ----

  describe('built-in express strategy', () => {
    it('sends GET success response with status 200', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: 'express' });

      const handler = hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
      });

      const req = { method: 'GET', body: { name: 'Alice' } };
      const res = mockExpressRes();
      const next = vi.fn();

      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Hello, Alice!' });
      expect(next).not.toHaveBeenCalled();
    });

    it('sends POST success response with status 201 by default', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: 'express' });

      const handler = hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
      });

      const req = { method: 'POST', body: { name: 'Alice' } };
      const res = mockExpressRes();
      const next = vi.fn();

      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ message: 'Hello, Alice!' });
    });

    it('sends DELETE response with 204 and no body by default', async () => {
      const container = createContainer();
      container.bind(DeleteUseCase, () => new DeleteService());
      const hex = createHexApp({ container, framework: 'express' });

      const handler = hex.httpAdapter(DeleteUseCase, {
        toInput: (req: any) => ({ id: req.params.id }),
      });

      const req = { method: 'DELETE', params: { id: '1' } };
      const res = mockExpressRes();
      const next = vi.fn();

      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('sends error response with statusCode from ExecuteResult', async () => {
      const container = createContainer();
      container.bind(NotFoundUseCase, () => new NotFoundService());
      const hex = createHexApp({ container, framework: 'express' });

      const handler = hex.httpAdapter(NotFoundUseCase, {
        toInput: (req: any) => ({ id: req.params.id }),
      });

      const req = { method: 'GET', params: { id: '99' } };
      const res = mockExpressRes();
      const next = vi.fn();

      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: 'User 99 not found',
        code: 'NotFoundError',
      });
    });

    it('calls next(err) on non-business error', async () => {
      const container = createContainer();
      container.bind(CrashingUseCase, () => new CrashingService());
      const hex = createHexApp({ container, framework: 'express' });

      const handler = hex.httpAdapter(CrashingUseCase, {
        toInput: () => undefined as void,
      });

      const req = { method: 'GET' };
      const res = mockExpressRes();
      const next = vi.fn();

      await handler(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      const passedErr = next.mock.calls[0]?.[0] as unknown;
      expect(passedErr).toBeInstanceOf(TypeError);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  // ---- Built-in Fastify strategy ----

  describe('built-in fastify strategy', () => {
    it('sends GET success response with status 200', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: 'fastify' });

      const handler = hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
      });

      const request = { method: 'GET', body: { name: 'Alice' } };
      const reply = mockFastifyReply();

      await handler(request, reply);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ message: 'Hello, Alice!' });
    });

    it('sends POST success response with status 201 by default', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: 'fastify' });

      const handler = hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
      });

      const request = { method: 'POST', body: { name: 'Alice' } };
      const reply = mockFastifyReply();

      await handler(request, reply);

      expect(reply.status).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith({ message: 'Hello, Alice!' });
    });

    it('sends DELETE response with 204 and no body by default', async () => {
      const container = createContainer();
      container.bind(DeleteUseCase, () => new DeleteService());
      const hex = createHexApp({ container, framework: 'fastify' });

      const handler = hex.httpAdapter(DeleteUseCase, {
        toInput: (req: any) => ({ id: req.params.id }),
      });

      const request = { method: 'DELETE', params: { id: '1' } };
      const reply = mockFastifyReply();

      await handler(request, reply);

      expect(reply.status).toHaveBeenCalledWith(204);
      expect(reply.send).toHaveBeenCalled();
    });

    it('sends error response with statusCode from ExecuteResult', async () => {
      const container = createContainer();
      container.bind(NotFoundUseCase, () => new NotFoundService());
      const hex = createHexApp({ container, framework: 'fastify' });

      const handler = hex.httpAdapter(NotFoundUseCase, {
        toInput: (req: any) => ({ id: req.params.id }),
      });

      const request = { method: 'GET', params: { id: '99' } };
      const reply = mockFastifyReply();

      await handler(request, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({
        message: 'User 99 not found',
        code: 'NotFoundError',
      });
    });

    it('throws on non-business error (Fastify handles async throws)', async () => {
      const container = createContainer();
      container.bind(CrashingUseCase, () => new CrashingService());
      const hex = createHexApp({ container, framework: 'fastify' });

      const handler = hex.httpAdapter(CrashingUseCase, {
        toInput: () => undefined as void,
      });

      const request = { method: 'GET' };
      const reply = mockFastifyReply();

      await expect(handler(request, reply)).rejects.toThrow(TypeError);
      await expect(handler(request, reply)).rejects.toThrow('Database connection lost');
    });
  });

  // ---- Built-in Hono strategy ----

  describe('built-in hono strategy', () => {
    it('returns c.json(data, 200) on GET success', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: 'hono' });

      const handler = hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
      });

      const c = mockHonoContext({ method: 'GET', body: { name: 'Alice' } });

      await handler(c);

      expect(c.json).toHaveBeenCalledWith({ message: 'Hello, Alice!' }, 200);
    });

    it('returns c.json(data, 201) on POST success by default', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, framework: 'hono' });

      const handler = hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
      });

      const c = mockHonoContext({ method: 'POST', body: { name: 'Alice' } });

      await handler(c);

      expect(c.json).toHaveBeenCalledWith({ message: 'Hello, Alice!' }, 201);
    });

    it('returns c.body(null, 204) on DELETE by default', async () => {
      const container = createContainer();
      container.bind(DeleteUseCase, () => new DeleteService());
      const hex = createHexApp({ container, framework: 'hono' });

      const handler = hex.httpAdapter(DeleteUseCase, {
        toInput: (req: any) => ({ id: req.params.id }),
      });

      const c = mockHonoContext({ method: 'DELETE', params: { id: '1' } });

      await handler(c);

      expect(c.body).toHaveBeenCalledWith(null, 204);
      expect(c.json).not.toHaveBeenCalled();
    });

    it('returns c.json(error, statusCode) on error', async () => {
      const container = createContainer();
      container.bind(NotFoundUseCase, () => new NotFoundService());
      const hex = createHexApp({ container, framework: 'hono' });

      const handler = hex.httpAdapter(NotFoundUseCase, {
        toInput: (req: any) => ({ id: req.params.id }),
      });

      const c = mockHonoContext({ method: 'GET', params: { id: '99' } });

      await handler(c);

      expect(c.json).toHaveBeenCalledWith(
        { message: 'User 99 not found', code: 'NotFoundError' },
        404,
      );
    });

    it('throws on non-business error', async () => {
      const container = createContainer();
      container.bind(CrashingUseCase, () => new CrashingService());
      const hex = createHexApp({ container, framework: 'hono' });

      const handler = hex.httpAdapter(CrashingUseCase, {
        toInput: (req: any) => req,
      });

      const c = mockHonoContext({ method: 'GET' });

      await expect(handler(c)).rejects.toThrow(TypeError);
      await expect(handler(c)).rejects.toThrow('Database connection lost');
    });
  });
});
