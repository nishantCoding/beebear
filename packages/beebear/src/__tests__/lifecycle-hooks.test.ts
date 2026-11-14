import { describe, it, expect, vi } from 'vitest';
import { createHexApp } from '../hex-app.js';
import { createContainer } from '../container.js';
import { Port } from '../port.js';
import { ValidationError } from '../errors.js';
import type { UseCase } from '../use-case.js';
import type { HexAppHooks, HookContext } from '../hex-app.js';

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

// Use case that throws a business error
interface FailingUseCase extends UseCase<{ email: string }, never> {}
const FailingUseCase = Port<FailingUseCase>('FailingUseCase');

class FailingService implements FailingUseCase {
  async execute(input: { email: string }): Promise<never> {
    throw new ValidationError(`Invalid email: ${input.email}`);
  }
}

// Use case that throws a non-business error
interface CrashingUseCase extends UseCase<void, never> {}
const CrashingUseCase = Port<CrashingUseCase>('CrashingUseCase');

class CrashingService implements CrashingUseCase {
  async execute(): Promise<never> {
    throw new TypeError('Database connection lost');
  }
}

// Use case with a small delay (for duration testing)
interface SlowUseCase extends UseCase<void, string> {}
const SlowUseCase = Port<SlowUseCase>('SlowUseCase');

class SlowService implements SlowUseCase {
  async execute(): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < 20) { /* busy wait */ }
    return 'done';
  }
}

// Helper to build a hex app with hooks and common bindings
function setupHex(hooks: HexAppHooks) {
  const container = createContainer();
  container.bind(GreetUseCase, () => new GreetService());
  container.bind(FailingUseCase, () => new FailingService());
  container.bind(CrashingUseCase, () => new CrashingService());
  container.bind(SlowUseCase, () => new SlowService());
  return createHexApp({ container, hooks });
}

// ---- Tests ----

describe('lifecycle hooks', () => {
  // ---- Backwards compatibility ----

  describe('no hooks (backwards compat)', () => {
    it('execute works without hooks option', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container });

      const result = await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(result).toEqual({ success: true, data: { message: 'Hello, Alice!' } });
    });

    it('execute works with empty hooks object', async () => {
      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());
      const hex = createHexApp({ container, hooks: {} });

      const result = await hex.execute(GreetUseCase, { name: 'Bob' });

      expect(result).toEqual({ success: true, data: { message: 'Hello, Bob!' } });
    });
  });

  // ---- beforeExecute ----

  describe('beforeExecute', () => {
    it('is called before the use case executes', async () => {
      const order: string[] = [];

      const container = createContainer();
      container.bind(GreetUseCase, () => ({
        async execute(input: GreetInput): Promise<GreetOutput> {
          order.push('execute');
          return { message: `Hello, ${input.name}!` };
        },
      }));

      const hex = createHexApp({
        container,
        hooks: {
          beforeExecute: () => { order.push('beforeExecute'); },
        },
      });

      await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(order).toEqual(['beforeExecute', 'execute']);
    });

    it('receives token, tokenName, and input', async () => {
      let captured: HookContext | undefined;

      const hex = setupHex({
        beforeExecute: (ctx) => { captured = { ...ctx }; },
      });

      await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(captured).toBeDefined();
      expect(captured!.token).toBe(GreetUseCase);
      expect(captured!.tokenName).toBe('GreetUseCase');
      expect(captured!.input).toEqual({ name: 'Alice' });
    });

    it('context.result is undefined', async () => {
      let result: unknown = 'sentinel';

      const hex = setupHex({
        beforeExecute: (ctx) => { result = ctx.result; },
      });

      await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(result).toBeUndefined();
    });

    it('context.error is undefined', async () => {
      let error: unknown = 'sentinel';

      const hex = setupHex({
        beforeExecute: (ctx) => { error = ctx.error; },
      });

      await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(error).toBeUndefined();
    });

    it('context.duration is 0', async () => {
      let duration = -1;

      const hex = setupHex({
        beforeExecute: (ctx) => { duration = ctx.duration; },
      });

      await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(duration).toBe(0);
    });
  });

  // ---- afterExecute ----

  describe('afterExecute', () => {
    it('is called after successful execution', async () => {
      const afterExecute = vi.fn();

      const hex = setupHex({ afterExecute });

      await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(afterExecute).toHaveBeenCalledOnce();
    });

    it('context.result is set on success', async () => {
      let captured: HookContext | undefined;

      const hex = setupHex({
        afterExecute: (ctx) => { captured = { ...ctx }; },
      });

      await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(captured!.result).toEqual({
        success: true,
        data: { message: 'Hello, Alice!' },
      });
      expect(captured!.error).toBeUndefined();
    });

    it('context.duration is set on success', async () => {
      let duration = -1;

      const hex = setupHex({
        afterExecute: (ctx) => { duration = ctx.duration; },
      });

      await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('is called after business error', async () => {
      const afterExecute = vi.fn();

      const hex = setupHex({ afterExecute });

      await hex.execute(FailingUseCase, { email: 'bad' });

      expect(afterExecute).toHaveBeenCalledOnce();
    });

    it('context has both result and error on business error', async () => {
      let captured: HookContext | undefined;

      const hex = setupHex({
        afterExecute: (ctx) => { captured = { ...ctx }; },
      });

      await hex.execute(FailingUseCase, { email: 'bad' });

      expect(captured!.result).toEqual({
        success: false,
        error: { message: 'Invalid email: bad', code: 'ValidationError' },
        statusCode: 400,
      });
      expect(captured!.error).toBeInstanceOf(ValidationError);
    });

    it('is called after non-business error', async () => {
      const afterExecute = vi.fn();

      const hex = setupHex({ afterExecute });

      await hex.execute(CrashingUseCase, undefined as void).catch(() => {});

      expect(afterExecute).toHaveBeenCalledOnce();
    });

    it('context.error set and context.result undefined on non-business error', async () => {
      let captured: HookContext | undefined;

      const hex = setupHex({
        afterExecute: (ctx) => { captured = { ...ctx }; },
      });

      await hex.execute(CrashingUseCase, undefined as void).catch(() => {});

      expect(captured!.error).toBeInstanceOf(TypeError);
      expect(captured!.result).toBeUndefined();
    });
  });

  // ---- onError ----

  describe('onError', () => {
    it('is called on business error', async () => {
      const onError = vi.fn();

      const hex = setupHex({ onError });

      await hex.execute(FailingUseCase, { email: 'bad' });

      expect(onError).toHaveBeenCalledOnce();
    });

    it('is called on non-business error', async () => {
      const onError = vi.fn();

      const hex = setupHex({ onError });

      await hex.execute(CrashingUseCase, undefined as void).catch(() => {});

      expect(onError).toHaveBeenCalledOnce();
    });

    it('is NOT called on success', async () => {
      const onError = vi.fn();

      const hex = setupHex({ onError });

      await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(onError).not.toHaveBeenCalled();
    });

    it('context.error is the thrown error', async () => {
      let captured: unknown;

      const hex = setupHex({
        onError: (ctx) => { captured = ctx.error; },
      });

      await hex.execute(FailingUseCase, { email: 'bad' });

      expect(captured).toBeInstanceOf(ValidationError);
      expect((captured as ValidationError).message).toBe('Invalid email: bad');
    });

    it('context.duration is set', async () => {
      let duration = -1;

      const hex = setupHex({
        onError: (ctx) => { duration = ctx.duration; },
      });

      await hex.execute(FailingUseCase, { email: 'bad' });

      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  // ---- Hook call order ----

  describe('hook call order', () => {
    it('success: beforeExecute → afterExecute, onError not called', async () => {
      const order: string[] = [];

      const hex = setupHex({
        beforeExecute: () => { order.push('before'); },
        afterExecute: () => { order.push('after'); },
        onError: () => { order.push('onError'); },
      });

      await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(order).toEqual(['before', 'after']);
    });

    it('business error: beforeExecute → onError → afterExecute', async () => {
      const order: string[] = [];

      const hex = setupHex({
        beforeExecute: () => { order.push('before'); },
        afterExecute: () => { order.push('after'); },
        onError: () => { order.push('onError'); },
      });

      await hex.execute(FailingUseCase, { email: 'bad' });

      expect(order).toEqual(['before', 'onError', 'after']);
    });

    it('non-business error: beforeExecute → onError → afterExecute, then re-throws', async () => {
      const order: string[] = [];

      const hex = setupHex({
        beforeExecute: () => { order.push('before'); },
        afterExecute: () => { order.push('after'); },
        onError: () => { order.push('onError'); },
      });

      await expect(
        hex.execute(CrashingUseCase, undefined as void)
      ).rejects.toThrow(TypeError);

      expect(order).toEqual(['before', 'onError', 'after']);
    });
  });

  // ---- Context sharing ----

  describe('context object', () => {
    it('same context object is passed to all hooks', async () => {
      const contexts: HookContext[] = [];

      const hex = setupHex({
        beforeExecute: (ctx) => { contexts.push(ctx); },
        afterExecute: (ctx) => { contexts.push(ctx); },
        onError: (ctx) => { contexts.push(ctx); },
      });

      await hex.execute(FailingUseCase, { email: 'bad' });

      // All three hooks fire for business error
      expect(contexts).toHaveLength(3);
      expect(contexts[0]).toBe(contexts[1]);
      expect(contexts[1]).toBe(contexts[2]);
    });

    it('each execute() call gets a fresh context', async () => {
      const contexts: HookContext[] = [];

      const hex = setupHex({
        beforeExecute: (ctx) => { contexts.push(ctx); },
      });

      await hex.execute(GreetUseCase, { name: 'Alice' });
      await hex.execute(GreetUseCase, { name: 'Bob' });

      expect(contexts).toHaveLength(2);
      expect(contexts[0]).not.toBe(contexts[1]);
    });
  });

  // ---- state ----

  describe('state', () => {
    it('starts as an empty object', async () => {
      let state: Record<string, unknown> | undefined;

      const hex = setupHex({
        beforeExecute: (ctx) => { state = ctx.state; },
      });

      await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(state).toEqual({});
    });

    it('data set in beforeExecute is visible in afterExecute', async () => {
      let spanId: unknown;

      const hex = setupHex({
        beforeExecute: (ctx) => { ctx.state.spanId = 'abc-123'; },
        afterExecute: (ctx) => { spanId = ctx.state.spanId; },
      });

      await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(spanId).toBe('abc-123');
    });

    it('data set in beforeExecute is visible in onError', async () => {
      let spanId: unknown;

      const hex = setupHex({
        beforeExecute: (ctx) => { ctx.state.spanId = 'err-456'; },
        onError: (ctx) => { spanId = ctx.state.spanId; },
      });

      await hex.execute(FailingUseCase, { email: 'bad' });

      expect(spanId).toBe('err-456');
    });

    it('state is not shared across execute() calls', async () => {
      const states: Record<string, unknown>[] = [];

      const hex = setupHex({
        beforeExecute: (ctx) => {
          ctx.state.callIndex = states.length;
          states.push(ctx.state);
        },
      });

      await hex.execute(GreetUseCase, { name: 'Alice' });
      await hex.execute(GreetUseCase, { name: 'Bob' });

      expect(states[0]).not.toBe(states[1]);
      expect(states[0]!.callIndex).toBe(0);
      expect(states[1]!.callIndex).toBe(1);
    });
  });

  // ---- tokenName ----

  describe('tokenName', () => {
    it('comes from token symbol description', async () => {
      let name = '';

      const hex = setupHex({
        beforeExecute: (ctx) => { name = ctx.tokenName; },
      });

      await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(name).toBe('GreetUseCase');
    });

    it('defaults to "unknown" for symbol without description', async () => {
      // Create a raw symbol without description
      const rawToken = Symbol() as any;
      let name = '';

      const container = createContainer();
      container.bind(rawToken, () => ({
        async execute() { return 'ok'; },
      }));

      const hex = createHexApp({
        container,
        hooks: {
          beforeExecute: (ctx) => { name = ctx.tokenName; },
        },
      });

      await hex.execute(rawToken, undefined);

      expect(name).toBe('unknown');
    });
  });

  // ---- duration ----

  describe('duration', () => {
    it('measures execution time in milliseconds', async () => {
      let duration = -1;

      const container = createContainer();
      container.bind(SlowUseCase, () => new SlowService());

      const hex = createHexApp({
        container,
        hooks: {
          afterExecute: (ctx) => { duration = ctx.duration; },
        },
      });

      await hex.execute(SlowUseCase, undefined as void);

      // SlowService waits 20ms, so duration should be at least 15ms
      // (allowing for timer imprecision)
      expect(duration).toBeGreaterThanOrEqual(15);
    });

    it('does not include hook execution time', async () => {
      let duration = -1;

      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());

      const hex = createHexApp({
        container,
        hooks: {
          beforeExecute: () => {
            // Simulate a slow hook — this time should NOT be in duration
            const start = Date.now();
            while (Date.now() - start < 30) { /* busy wait */ }
          },
          afterExecute: (ctx) => { duration = ctx.duration; },
        },
      });

      await hex.execute(GreetUseCase, { name: 'Alice' });

      // GreetService is near-instant, so duration should be well under 30ms
      // even though beforeExecute took 30ms
      expect(duration).toBeLessThan(25);
    });
  });

  // ---- Hook errors propagate ----

  describe('hook errors propagate', () => {
    it('beforeExecute error propagates and use case does not run', async () => {
      const executeSpy = vi.fn();

      const container = createContainer();
      container.bind(GreetUseCase, () => ({
        async execute(input: GreetInput): Promise<GreetOutput> {
          executeSpy();
          return { message: `Hello, ${input.name}!` };
        },
      }));

      const hex = createHexApp({
        container,
        hooks: {
          beforeExecute: () => { throw new Error('hook broke'); },
        },
      });

      await expect(
        hex.execute(GreetUseCase, { name: 'Alice' })
      ).rejects.toThrow('hook broke');

      expect(executeSpy).not.toHaveBeenCalled();
    });

    it('afterExecute error propagates', async () => {
      const hex = setupHex({
        afterExecute: () => { throw new Error('after broke'); },
      });

      await expect(
        hex.execute(GreetUseCase, { name: 'Alice' })
      ).rejects.toThrow('after broke');
    });

    it('onError error propagates', async () => {
      const hex = setupHex({
        onError: () => { throw new Error('onError broke'); },
      });

      await expect(
        hex.execute(FailingUseCase, { email: 'bad' })
      ).rejects.toThrow('onError broke');
    });
  });

  // ---- Partial hooks ----

  describe('partial hooks', () => {
    it('only beforeExecute provided', async () => {
      const beforeExecute = vi.fn();

      const hex = setupHex({ beforeExecute });

      const result = await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(beforeExecute).toHaveBeenCalledOnce();
      expect(result).toEqual({ success: true, data: { message: 'Hello, Alice!' } });
    });

    it('only afterExecute provided', async () => {
      const afterExecute = vi.fn();

      const hex = setupHex({ afterExecute });

      const result = await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(afterExecute).toHaveBeenCalledOnce();
      expect(result).toEqual({ success: true, data: { message: 'Hello, Alice!' } });
    });

    it('only onError provided', async () => {
      const onError = vi.fn();

      const hex = setupHex({ onError });

      // Success case — onError should not fire
      const result = await hex.execute(GreetUseCase, { name: 'Alice' });
      expect(onError).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, data: { message: 'Hello, Alice!' } });

      // Error case — onError should fire
      await hex.execute(FailingUseCase, { email: 'bad' });
      expect(onError).toHaveBeenCalledOnce();
    });
  });

  // ---- httpAdapter fires hooks ----

  describe('hooks fire via httpAdapter', () => {
    it('hooks fire when httpAdapter handles a request', async () => {
      const order: string[] = [];

      const container = createContainer();
      container.bind(GreetUseCase, () => new GreetService());

      const hex = createHexApp({
        container,
        framework: {
          createHandler(executeRoute, _options) {
            return async (req: any) => {
              const result = await executeRoute(req);
              return result;
            };
          },
        },
        hooks: {
          beforeExecute: () => { order.push('before'); },
          afterExecute: () => { order.push('after'); },
        },
      });

      const handler = hex.httpAdapter(GreetUseCase, {
        toInput: (req: any) => ({ name: req.body.name }),
      });

      await handler({ method: 'POST', body: { name: 'Alice' } });

      expect(order).toEqual(['before', 'after']);
    });
  });

  // ---- Return value unaffected ----

  describe('hooks do not alter return value', () => {
    it('success result is returned unchanged', async () => {
      const hex = setupHex({
        beforeExecute: () => {},
        afterExecute: () => {},
      });

      const result = await hex.execute(GreetUseCase, { name: 'Alice' });

      expect(result).toEqual({ success: true, data: { message: 'Hello, Alice!' } });
    });

    it('business error result is returned unchanged', async () => {
      const hex = setupHex({
        onError: () => {},
        afterExecute: () => {},
      });

      const result = await hex.execute(FailingUseCase, { email: 'bad' });

      expect(result).toEqual({
        success: false,
        error: { message: 'Invalid email: bad', code: 'ValidationError' },
        statusCode: 400,
      });
    });

    it('non-business error is re-thrown unchanged', async () => {
      const hex = setupHex({
        onError: () => {},
        afterExecute: () => {},
      });

      try {
        await hex.execute(CrashingUseCase, undefined as void);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TypeError);
        expect((err as TypeError).message).toBe('Database connection lost');
      }
    });
  });
});
