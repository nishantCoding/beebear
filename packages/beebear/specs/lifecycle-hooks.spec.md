# Spec: Lifecycle Hooks — `beforeExecute`, `afterExecute`, `onError`

## The Problem

Right now, `hex.execute()` does one thing: resolve → run → return result.
There's no way for the developer to plug in cross-cutting concerns that
run around every use case execution. Things like:

- Logging: "RegisterUser started with input {...}"
- Timing: "RegisterUser took 42ms"
- Tracing: attach a span ID before execution, close it after
- Metrics: count how many times each use case runs, how many fail
- Auditing: record who did what and when

Without hooks, the developer has two bad options:

**Option A: Wrap every use case manually**

```ts
const result = await hex.execute(RegisterUser, input);
// Can't log before, can't time it, can't catch errors centrally
```

They'd have to write wrapper code around every `hex.execute()` call or
every `httpAdapter()` route. That's boilerplate — exactly what beebear
is supposed to eliminate.

**Option B: Put it inside use cases**

```ts
class RegisterUserService {
  async execute(input) {
    console.log('RegisterUser started');  // logging in domain logic?
    const start = Date.now();
    // ... business logic ...
    console.log(`Took ${Date.now() - start}ms`);  // timing in domain?
  }
}
```

This pollutes the domain layer with infrastructure concerns. Use cases
should contain only business logic.

---

## The Solution

The developer registers hook functions when creating the hex app:

```ts
const hex = createHexApp({
  container,
  framework: 'express',
  hooks: {
    beforeExecute: (context) => {
      console.log(`${context.tokenName} started`, context.input);
    },
    afterExecute: (context) => {
      console.log(`${context.tokenName} completed in ${context.duration}ms`);
    },
    onError: (context) => {
      console.error(`${context.tokenName} failed:`, context.error);
    },
  },
});
```

beebear calls these hooks automatically around every `hex.execute()` call.
Since `httpAdapter` calls `hex.execute()` internally, hooks fire for
HTTP routes too — zero extra work.

---

## How It Works

### What happens today (without hooks)

```
hex.execute(RegisterUser, { email, name })
    │
    ├─ resolve use case from container
    ├─ call useCase.execute(input)
    └─ return ExecuteResult (success or error)
```

### What happens with hooks

```
hex.execute(RegisterUser, { email, name })
    │
    ├─ build context: { token, tokenName, input }
    │
    ├─ call beforeExecute(context)
    │
    ├─ resolve use case from container
    ├─ call useCase.execute(input)
    │
    ├─ on success:
    │    ├─ set context.result and context.duration
    │    ├─ call afterExecute(context)
    │    └─ return ExecuteResult { success: true, data }
    │
    ├─ on business error:
    │    ├─ set context.error and context.duration
    │    ├─ call onError(context)
    │    ├─ call afterExecute(context)
    │    └─ return ExecuteResult { success: false, error, statusCode }
    │
    └─ on non-business error:
         ├─ set context.error and context.duration
         ├─ call onError(context)
         ├─ call afterExecute(context)
         └─ re-throw the error
```

### Pseudo-code of `hex.execute()` with hooks

Here's what the updated `execute` looks like internally:

```ts
async execute(token, input) {
  // 1. Build the context object — shared across all hooks for this call
  const context = {
    token,
    tokenName: token.description ?? 'unknown',
    input,
    result: undefined,   // set after success
    error: undefined,     // set after error
    duration: 0,          // set after execution
  };

  // 2. Call beforeExecute (if provided)
  if (hooks.beforeExecute) {
    hooks.beforeExecute(context);
  }

  const start = Date.now();

  try {
    // 3. Resolve and run the use case (same as before)
    const useCase = container.resolve(token);
    const data = await useCase.execute(input);
    const result = { success: true, data };

    // 4. Set result and duration on context
    context.result = result;
    context.duration = Date.now() - start;

    // 5. Call afterExecute (if provided)
    if (hooks.afterExecute) {
      hooks.afterExecute(context);
    }

    return result;
  } catch (err) {
    context.duration = Date.now() - start;
    context.error = err;

    // 6. Call onError (if provided)
    if (hooks.onError) {
      hooks.onError(context);
    }

    // 7. Map business errors to ExecuteResult (same as before)
    if (err instanceof BusinessError) {
      const result = {
        success: false,
        error: { message: err.message, code: err.code },
        statusCode: errorMap[err.name] ?? 400,
      };
      context.result = result;

      // 8. Call afterExecute for business errors too
      if (hooks.afterExecute) {
        hooks.afterExecute(context);
      }

      return result;
    }

    // 9. Non-business errors: afterExecute still fires, then re-throw
    if (hooks.afterExecute) {
      hooks.afterExecute(context);
    }

    throw err;
  }
}
```

Key points from the pseudo-code:

- `beforeExecute` fires before anything happens — before resolve, before execute
- `afterExecute` fires after everything — on success, on business error, and on non-business error. It always fires.
- `onError` fires only when an error occurs (business or non-business)
- For business errors: `onError` fires first, then `afterExecute`
- For non-business errors: `onError` fires, then `afterExecute`, then the error re-throws
- All three hooks receive the same `context` object. Hooks that run later see values set by the execution (result, error, duration).

---

## The Context Object

All hooks receive a context object. The context is built once per
`hex.execute()` call and passed to each hook. Later hooks see values
that were set during execution.

```ts
export interface HookContext {
  /** The DI token for the use case */
  token: symbol;

  /** Human-readable name from token.description (e.g., "RegisterUser") */
  tokenName: string;

  /** The input passed to hex.execute() */
  input: unknown;

  /** The ExecuteResult — set after execution completes (success or business error) */
  result?: ExecuteResult<unknown>;

  /** The error — set if execution threw (business or non-business) */
  error?: unknown;

  /** Execution time in milliseconds — set after execution completes */
  duration: number;

  /** Developer-owned state — for passing data between hooks */
  state: Record<string, unknown>;
}
```

### `state` — passing data between hooks

The `state` field is an empty object (`{}`) that the developer can use
to pass arbitrary data between hooks for the same execution. beebear
never reads or writes to it — it's entirely developer-owned.

This is useful for tracing, where a span needs to be started in
`beforeExecute` and ended in `afterExecute`:

```ts
hooks: {
  beforeExecute: (ctx) => {
    ctx.state.span = tracer.startSpan(ctx.tokenName);
  },
  afterExecute: (ctx) => {
    const span = ctx.state.span as Span;
    span.setAttribute('duration', ctx.duration);
    span.end();
  },
}
```

Since all hooks for one `hex.execute()` call share the same context
object, `afterExecute` sees whatever `beforeExecute` put in `state`.

### What each hook sees

| Field | `beforeExecute` | `afterExecute` | `onError` |
|-------|-----------------|----------------|-----------|
| `token` | always set | always set | always set |
| `tokenName` | always set | always set | always set |
| `input` | always set | always set | always set |
| `result` | `undefined` | set (success or business error) | `undefined` |
| `error` | `undefined` | set if error occurred | always set |
| `duration` | `0` | set | set |
| `state` | `{}` (empty) | whatever hooks put in it | whatever hooks put in it |

---

## Hook Call Order

### Success case

```
beforeExecute(context)    →  context has: token, tokenName, input
  │
  useCase.execute(input)  →  runs the business logic
  │
afterExecute(context)     →  context has: + result, duration
```

### Business error case (ValidationError, NotFoundError, etc.)

```
beforeExecute(context)    →  context has: token, tokenName, input
  │
  useCase.execute(input)  →  throws ValidationError
  │
onError(context)          →  context has: + error, duration
  │
afterExecute(context)     →  context has: + result (error result), error, duration
```

### Non-business error case (TypeError, connection failure, etc.)

```
beforeExecute(context)    →  context has: token, tokenName, input
  │
  useCase.execute(input)  →  throws TypeError
  │
onError(context)          →  context has: + error, duration
  │
afterExecute(context)     →  context has: + error, duration (result is undefined)
  │
  error re-throws         →  propagates to caller
```

---

## Public API

### `HexAppHooks`

```ts
export interface HexAppHooks {
  beforeExecute?: (context: HookContext) => void;
  afterExecute?: (context: HookContext) => void;
  onError?: (context: HookContext) => void;
}
```

All three are optional. If not provided, that hook is skipped.

### Updated `HexAppOptions`

```ts
export interface HexAppOptions {
  container: Container;
  errorMap?: Record<string, number>;
  framework?: BuiltInFramework | FrameworkStrategy;
  hooks?: HexAppHooks;
}
```

- `hooks` — optional. If omitted, no hooks fire. `execute()` behaves
  exactly as before.

### `HookContext`

```ts
export interface HookContext {
  token: symbol;
  tokenName: string;
  input: unknown;
  result?: ExecuteResult<unknown>;
  error?: unknown;
  duration: number;
}
```

### Updated `HexApp` interface

No change to the `HexApp` interface. `execute()` and `httpAdapter()`
signatures remain the same. Hooks are transparent to the caller.

---

## Behavior Rules

1. **All hooks are optional.**
   If `hooks` is not provided, or a specific hook is not provided,
   that hook is simply skipped. No default behavior, no no-ops.

2. **Hooks are synchronous.**
   Hook functions are `() => void`, not async. This is intentional:
   - Logging, metrics, tracing are typically synchronous operations
     (write to buffer, increment counter, set span attribute)
   - Async hooks would complicate the execute pipeline and error handling
   - If the developer needs async (e.g., write to database), they can
     fire-and-forget inside the hook or queue the work

3. **`beforeExecute` fires before resolve and execute.**
   It fires before `container.resolve(token)` and before
   `useCase.execute(input)`. The context has `token`, `tokenName`,
   and `input` at this point. `result`, `error`, and `duration` are
   not yet set.

4. **`afterExecute` always fires.**
   It fires after execution completes, regardless of outcome:
   - On success: `context.result` is the success result, no `error`
   - On business error: `context.result` is the error result,
     `context.error` is the thrown error
   - On non-business error: `context.error` is the thrown error,
     `context.result` is `undefined` (no ExecuteResult was built)

   `afterExecute` fires before the non-business error re-throws.

5. **`onError` fires only on errors.**
   It fires when `useCase.execute()` throws — both business errors
   and non-business errors. `context.error` is the thrown error.
   `onError` fires before `afterExecute`.

6. **Hook call order: `beforeExecute` → execute → `onError` → `afterExecute`.**
   On success, `onError` is skipped. On error, `onError` fires first,
   then `afterExecute`. This lets `afterExecute` be used as a "finally"
   block (always runs, sees the final state).

7. **`context.duration` measures use case execution time.**
   The timer starts just before `container.resolve(token)` and ends
   after `useCase.execute(input)` completes (or throws). It does NOT
   include hook execution time. Duration is in milliseconds.

8. **One context object per `hex.execute()` call.**
   Each call to `hex.execute()` creates a fresh context object. The
   same object is passed to all hooks for that call. Hooks can read
   values set by earlier phases (e.g., `afterExecute` can read `error`
   set during the catch block).

9. **Hook errors are not caught.**
   If a hook throws, the error propagates. beebear does not wrap or
   swallow hook errors. This is intentional — a broken hook is a bug
   that should surface immediately, not be silently ignored.

10. **Hooks fire for both `execute()` and `httpAdapter()` calls.**
    Since `httpAdapter` calls `hex.execute()` internally, hooks fire
    automatically for HTTP routes. No separate hook registration for
    HTTP vs direct calls.

11. **Hooks are set once at startup.**
    The `hooks` option in `createHexApp()` is set once during
    construction. Hooks cannot be added or removed after creation.

12. **`tokenName` comes from the token's symbol description.**
    `Port<T>('RegisterUser')` creates a symbol with
    `description === 'RegisterUser'`. `tokenName` is that description.
    If the description is `undefined` (shouldn't happen with Port/Token),
    `tokenName` defaults to `'unknown'`.

---

## Usage Examples

### Logging

```ts
const hex = createHexApp({
  container,
  framework: 'express',
  hooks: {
    beforeExecute: (ctx) => {
      console.log(`[${ctx.tokenName}] started`, ctx.input);
    },
    afterExecute: (ctx) => {
      console.log(`[${ctx.tokenName}] completed in ${ctx.duration}ms`);
    },
    onError: (ctx) => {
      console.error(`[${ctx.tokenName}] failed:`, ctx.error);
    },
  },
});
```

### Timing / metrics

```ts
const hex = createHexApp({
  container,
  hooks: {
    afterExecute: (ctx) => {
      metrics.histogram('usecase.duration', ctx.duration, {
        useCase: ctx.tokenName,
        success: ctx.result?.success ? 'true' : 'false',
      });
    },
  },
});
```

### Using only one hook

```ts
// Only log errors — no beforeExecute or afterExecute needed
const hex = createHexApp({
  container,
  hooks: {
    onError: (ctx) => {
      errorTracker.capture(ctx.error, {
        useCase: ctx.tokenName,
        input: ctx.input,
      });
    },
  },
});
```

### Works with httpAdapter automatically

```ts
const hex = createHexApp({
  container,
  framework: 'express',
  hooks: {
    beforeExecute: (ctx) => console.log(`[${ctx.tokenName}] started`),
    afterExecute: (ctx) => console.log(`[${ctx.tokenName}] done in ${ctx.duration}ms`),
  },
});

// Hooks fire automatically when this route is hit
app.post('/users', hex.httpAdapter(RegisterUser, {
  toInput: (req) => req.body,
}));

// Hooks fire for direct execute() calls too
const result = await hex.execute(RegisterUser, { email: 'a@b.com' });

// Both log:
// [RegisterUser] started
// [RegisterUser] done in 12ms
```

---

## Non-Goals

- No async hooks — hooks are synchronous `() => void`
- No hook middleware chain — no next(), no ordering, no composition
- No hook-level error handling — hook errors propagate as-is
- No per-route or per-use-case hooks — hooks are global, set once
- No hook removal or dynamic registration after startup
- No built-in logging/metrics — beebear provides the hooks, the
  developer plugs in their own stack
- No request/response context in hooks — hooks see use case input
  and output, not HTTP request/response. For HTTP-level observability,
  use the framework's middleware.
