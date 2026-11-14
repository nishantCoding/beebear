# Spec: `hex.execute()` — Framework-Agnostic Use Case Runner

## Purpose

`hex.execute()` is the core function that runs a use case through the beebear
pipeline. It resolves the use case from the DI container, calls `execute()`,
catches business errors, maps them to status codes via the `errorMap`, and
returns a structured result.

This is the foundation that everything else builds on:
- `httpAdapter()` is a convenience wrapper that calls `hex.execute()` internally
  and maps the result to an HTTP response.
- Developers using unsupported frameworks or raw Node.js `http` can use
  `hex.execute()` directly and handle the response themselves.

---

## Public API

### `ExecuteResult<T>`

```ts
export type ExecuteResult<T> =
  | { success: true; data: T }
  | { success: false; error: { message: string; code: string }; statusCode: number };
```

A discriminated union. Consumers check `result.success` to narrow the type.

### `hex.execute()`

```ts
execute<TInput, TOutput>(
  token: InjectionToken<UseCase<TInput, TOutput>>,
  input: TInput,
): Promise<ExecuteResult<TOutput>>
```

- `token` — the DI token for the use case (created via `Port<T>()` or `Token<T>()`)
- `input` — the data to pass to `useCase.execute(input)`
- Returns a `Promise<ExecuteResult<TOutput>>` — never throws business errors

### `createHexApp()`

`hex.execute()` lives on the object returned by `createHexApp()`:

```ts
export interface HexApp {
  execute<TInput, TOutput>(
    token: InjectionToken<UseCase<TInput, TOutput>>,
    input: TInput,
  ): Promise<ExecuteResult<TOutput>>;
}

export function createHexApp(options: HexAppOptions): HexApp;
```

### `HexAppOptions`

```ts
export interface HexAppOptions {
  container: Container;
  errorMap?: Record<string, number>;
}
```

- `container` — the DI container with all bindings registered
- `errorMap` — optional map of error class name → HTTP status code.
  Merged with the default error map (developer overrides win).

### Default Error Map

beebear ships defaults for its built-in error classes:

```ts
const DEFAULT_ERROR_MAP: Record<string, number> = {
  BusinessError: 400,
  ValidationError: 400,
  NotFoundError: 404,
  ConflictError: 409,
  UnauthorizedError: 401,
  ForbiddenError: 403,
};
```

Developer-provided `errorMap` entries override these defaults.

---

## Behavior Rules

1. **Resolves use case from container.**
   `hex.execute(token, input)` calls `container.resolve(token)` to get the
   use case instance. The container handles lifecycle (singleton, transient,
   scoped) as configured at bind time.

2. **Calls `useCase.execute(input)`.**
   Passes the input through unchanged. The use case does its business logic.

3. **Success → returns `{ success: true, data }`.**
   If `execute()` returns normally, the return value is wrapped:
   ```ts
   { success: true, data: result }
   ```
   Where `result` is whatever `useCase.execute()` resolved to.

4. **Business error thrown → returns `{ success: false, error, statusCode }`.**
   If `execute()` throws a `BusinessError` (or subclass), it's caught and mapped:
   ```ts
   {
     success: false,
     error: { message: err.message, code: err.code },
     statusCode: errorMap[err.name] ?? 400,
   }
   ```
   The `statusCode` is looked up from the merged error map using `err.name`
   (the error class name). Falls back to 400 if not found.

5. **Non-business errors are re-thrown.**
   If `execute()` throws something that is NOT a `BusinessError` (e.g. a
   `TypeError`, a database connection error, or any unexpected exception),
   `hex.execute()` re-throws it. These are infrastructure errors — the
   framework doesn't swallow them. The caller (or the HTTP framework's
   error handler) must handle them.

6. **Error map merging.**
   The effective error map is `{ ...DEFAULT_ERROR_MAP, ...options.errorMap }`.
   Developer entries override defaults. For example:
   ```ts
   createHexApp({
     container,
     errorMap: {
       ValidationError: 422,          // override default 400
       UserAlreadyExistsError: 409,   // app-specific error
     },
   });
   ```
   Now `ValidationError` maps to 422 instead of 400.

7. **`void` output works.**
   If the use case returns `void` (`Promise<void>`), the result is:
   ```ts
   { success: true, data: undefined }
   ```

8. **Token resolution failure is NOT caught.**
   If the token has no binding in the container, `container.resolve()` throws.
   This error is NOT a `BusinessError`, so it re-throws per rule 5. This is
   correct — a missing binding is a configuration bug, not a business error.

9. **Error map is immutable after creation.**
   The error map is merged once during `createHexApp()`. Mutating the
   original `errorMap` object after creation has no effect.

10. **Lifecycle hooks (future).**
    `beforeExecute`, `afterExecute`, and `onError` hooks will be added in a
    later spec. This spec covers the core execute pipeline only.

---

## Usage Examples

### Basic usage

```ts
import { createHexApp, createContainer, Port } from 'beebear';
import type { UseCase } from 'beebear';

// Setup
interface RegisterUser extends UseCase<{ email: string }, { id: string }> {}
const RegisterUser = Port<RegisterUser>('RegisterUser');

const container = createContainer();
container.bind(RegisterUser, () => new RegisterUserService(/* deps */));

const hex = createHexApp({ container });

// Execute
const result = await hex.execute(RegisterUser, { email: 'a@b.com' });

if (result.success) {
  console.log(result.data.id);  // typed as { id: string }
} else {
  console.log(result.error.message);  // error message
  console.log(result.statusCode);     // HTTP status code
}
```

### Custom error map

```ts
const hex = createHexApp({
  container,
  errorMap: {
    UserAlreadyExistsError: 409,
    InsufficientBalanceError: 422,
    ValidationError: 422,  // override default 400
  },
});
```

### With raw Node.js http

```ts
import { createServer } from 'http';

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/users') {
    const body = await parseBody(req);
    const result = await hex.execute(RegisterUser, body);

    if (result.success) {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.data));
    } else {
      res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.error));
    }
  }
});
```

---

## Non-Goals

- No HTTP awareness — `hex.execute()` returns a status code in the error
  result, but it doesn't send HTTP responses. That's `httpAdapter()`'s job.
- No middleware/interceptor pipeline — lifecycle hooks come in a later spec.
- No Result<T, E> pattern handling — the core path is throw/catch.
  Result support may be added later without changing `ExecuteResult<T>`.
- No retry logic — that's the developer's concern.
- No timeout — that's the developer's concern.
- No input validation — validation happens before `hex.execute()` at the
  boundary, or inside the use case itself.
