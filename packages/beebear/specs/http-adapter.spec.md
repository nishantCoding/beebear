# Spec: `hex.httpAdapter()` + FrameworkStrategy

## The Problem

Every HTTP route in a hex arch app has the same boilerplate:

```ts
app.post('/users', async (req, res) => {
  try {
    const input = { email: req.body.email, name: req.body.name };
    const result = await useCase.execute(input);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof ValidationError) res.status(400).json({ error: err.message });
    else if (err instanceof NotFoundError) res.status(404).json({ error: err.message });
    else if (err instanceof ConflictError) res.status(409).json({ error: err.message });
    // ... same for every route
  }
});
```

The only things that change per route are:
1. Which use case to call
2. How to extract input from `req`
3. The success status code

Everything else is repeated boilerplate.

---

## The Solution

With `hex.httpAdapter()`, the developer writes:

```ts
app.post('/users', hex.httpAdapter(RegisterUser, {
  toInput: (req) => ({ email: req.body.email, name: req.body.name }),
}));
```

beebear handles the rest — resolving the use case, calling `execute()`,
catching business errors, mapping to status codes, sending the response.

The success status code is inferred from the HTTP method: POST → 201,
DELETE → 204, everything else → 200. The developer can override it
with `status` when the default doesn't fit.

---

## How It Works

### Step 1: Developer sets up beebear (once at startup)

```ts
import { createHexApp, createContainer } from 'beebear';

const hex = createHexApp({
  container,              // DI container with all bindings
  errorMap: { ... },      // error class name → HTTP status code
  framework: 'express',   // tells beebear which HTTP framework you're using
});
```

The `framework` option tells beebear which HTTP framework the developer is
using. For the three major frameworks (Express, Fastify, Hono), the developer
just passes a string. beebear ships built-in strategies for these three.

For niche or custom frameworks, the developer passes a `FrameworkStrategy`
object instead (more on this below).

### Step 2: Developer defines routes

```ts
// POST defaults to 201 — no need to specify
app.post('/users', hex.httpAdapter(RegisterUser, {
  toInput: (req) => ({ email: req.body.email, name: req.body.name }),
}));

// GET defaults to 200
app.get('/users/:id', hex.httpAdapter(GetUser, {
  toInput: (req) => ({ id: req.params.id }),
}));

// DELETE defaults to 204
app.delete('/users/:id', hex.httpAdapter(DeleteUser, {
  toInput: (req) => ({ id: req.params.id }),
}));

// Override: this POST should return 200 (e.g., login, search)
app.post('/login', hex.httpAdapter(Login, {
  toInput: (req) => ({ email: req.body.email, password: req.body.password }),
  status: 200,
}));
```

Each call to `httpAdapter` returns a framework-specific handler function
that goes directly into the router.

### Step 3: What happens internally when `httpAdapter()` is called

Each `httpAdapter()` call builds its own `executeRoute` function with the
token and `toInput` baked in, then hands it to the strategy along with a
`resolveStatus` function that knows the right success status code.

```
hex.httpAdapter(RegisterUser, { toInput: (req) => req.body })
    → builds executeRoute_1 (has RegisterUser token + toInput_1 inside)
    → builds resolveStatus_1 (no explicit status → uses method default)
    → calls strategy.createHandler(executeRoute_1, { resolveStatus: resolveStatus_1 })
    → strategy returns middleware_1

hex.httpAdapter(GetUser, { toInput: (req) => ({ id: req.params.id }) })
    → builds executeRoute_2 (has GetUser token + toInput_2 inside)
    → builds resolveStatus_2 (no explicit status → uses method default)
    → calls strategy.createHandler(executeRoute_2, { resolveStatus: resolveStatus_2 })
    → strategy returns middleware_2

hex.httpAdapter(Login, { toInput: (req) => req.body, status: 200 })
    → builds executeRoute_3 (has Login token + toInput_3 inside)
    → builds resolveStatus_3 (explicit status: 200 → always returns 200)
    → calls strategy.createHandler(executeRoute_3, { resolveStatus: resolveStatus_3 })
    → strategy returns middleware_3
```

Each middleware goes into the router:

```ts
app.post('/users',       middleware_1);
app.get('/users/:id',    middleware_2);
app.post('/login',       middleware_3);
```

Here is the pseudo-code of what `httpAdapter` does internally:

```ts
// Method-based defaults (inside beebear)
const METHOD_DEFAULTS: Record<string, number> = {
  POST: 201,
  DELETE: 204,
};

// Inside hex.httpAdapter(token, options):

// 1. Build executeRoute — a function that takes a raw request,
//    extracts input via toInput, and runs the use case.
const executeRoute = async (req) => {
  const input = options.toInput(req);
  return await hex.execute(token, input);
};

// 2. Build resolveStatus — a function the strategy calls at request time
//    to get the success status code based on the HTTP method.
//    Priority: explicit status > method default > 200
const resolveStatus = (method: string) =>
  options.status ?? METHOD_DEFAULTS[method] ?? 200;

// 3. Hand both to the strategy to wrap in a framework-specific handler.
const handler = strategy.createHandler(executeRoute, { resolveStatus });

// 4. Return the handler. This is what goes into app.post(), app.get(), etc.
return handler;
```

At this point nothing has executed yet — only functions have been built
and connected. The actual execution happens when an HTTP request arrives.

### Step 4: What happens when an HTTP request arrives

```
HTTP POST /users
    │
    ├─ Express calls the handler(req, res, next)
    │
    ├─ handler calls executeRoute(req)
    │    ├─ toInput(req) extracts { email, name } from req.body
    │    └─ hex.execute(RegisterUser, { email, name })
    │         ├─ resolves use case from container
    │         ├─ calls useCase.execute({ email, name })
    │         └─ returns ExecuteResult:
    │              success: { success: true, data: { id: "1" } }
    │              or error: { success: false, error: {...}, statusCode: 409 }
    │
    └─ handler sends HTTP response:
         success → resolveStatus("POST") = 201
                   res.status(201).json({ id: "1" })
         error   → res.status(409).json({ message: "...", code: "..." })
```

---

## Success Status Resolution

beebear resolves the success status code using this priority:

```
explicit status (from options)  >  method default  >  200
```

### Method defaults

| HTTP Method | Default Status |
|-------------|---------------|
| `POST`      | 201 Created   |
| `DELETE`    | 204 No Content|
| Everything else | 200 OK   |

### Override with `status`

The developer passes `status` in `httpAdapter` options to override the
method default:

```ts
// POST /login should return 200, not 201
app.post('/login', hex.httpAdapter(Login, {
  toInput: (req) => req.body,
  status: 200,  // overrides POST default of 201
}));

// DELETE /users/:id should return 200 with deleted resource, not 204
app.delete('/users/:id', hex.httpAdapter(DeleteUser, {
  toInput: (req) => ({ id: req.params.id }),
  status: 200,  // overrides DELETE default of 204
}));
```

### Error status is separate

Error status codes come from `ExecuteResult.statusCode` (set by
`hex.execute()` via the `errorMap`). `resolveStatus` is only called
in the success path. The two never mix.

### `resolveStatus` lives in beebear core, not in strategies

The `resolveStatus` function is built by `httpAdapter` and passed to
the strategy via `RouteOptions`. This means all strategies — built-in
and custom — get consistent method-based defaulting automatically.
The strategy just calls `options.resolveStatus(req.method)`.

---

## Built-In Strategies

beebear ships built-in strategies for three major frameworks. The developer
passes a string to `framework` and beebear uses the corresponding strategy
internally:

| String        | Framework |
|---------------|-----------|
| `'express'`   | Express   |
| `'fastify'`   | Fastify   |
| `'hono'`      | Hono      |

These built-in strategies use `any` types internally — beebear does NOT
import Express, Fastify, or Hono. The actual framework must be installed
by the developer as a regular dependency. beebear declares them as optional
`peerDependencies`.

### How the built-in strategies work internally

**Express strategy** (built-in):

```ts
// Internal to beebear — developer never sees this
{
  createHandler(executeRoute, options) {
    return async (req: any, res: any, next: any) => {
      try {
        const result = await executeRoute(req);
        if (!result.success) {
          return res.status(result.statusCode).json(result.error);
        }
        const status = options.resolveStatus(req.method);
        if (status === 204) return res.status(204).send();
        res.status(status).json(result.data);
      } catch (err) {
        next(err);
      }
    };
  },
}
```

**Fastify strategy** (built-in):

```ts
{
  createHandler(executeRoute, options) {
    return async (request: any, reply: any) => {
      const result = await executeRoute(request);
      if (!result.success) {
        return reply.status(result.statusCode).send(result.error);
      }
      const status = options.resolveStatus(request.method);
      if (status === 204) return reply.status(204).send();
      reply.status(status).send(result.data);
    };
  },
}
```

**Hono strategy** (built-in):

```ts
{
  createHandler(executeRoute, options) {
    return async (c: any) => {
      const result = await executeRoute(c.req);
      if (!result.success) {
        return c.json(result.error, result.statusCode);
      }
      const status = options.resolveStatus(c.req.method);
      if (status === 204) return c.body(null, 204);
      return c.json(result.data, status);
    };
  },
}
```

### Strategy resolution inside `createHexApp`

When `createHexApp` receives the `framework` option, it resolves the
strategy once at startup:

```ts
// Pseudo-code inside createHexApp:
let strategy: FrameworkStrategy | undefined;

if (typeof options.framework === 'string') {
  // Look up built-in strategy by name
  strategy = BUILT_IN_STRATEGIES[options.framework];
  if (!strategy) {
    throw new Error(`Unknown framework: "${options.framework}". Supported: express, fastify, hono`);
  }
} else if (options.framework && typeof options.framework === 'object') {
  // Custom strategy object
  strategy = options.framework;
}
// If options.framework is undefined, strategy stays undefined.
// httpAdapter() will throw when called. execute() still works.
```

---

## Custom FrameworkStrategy (escape hatch)

For frameworks not covered by the three built-in strategies (e.g., Koa,
raw Node.js `http`, or a custom framework), the developer passes a
`FrameworkStrategy` object directly:

```ts
import type { FrameworkStrategy } from 'beebear';

const koaStrategy: FrameworkStrategy = {
  createHandler(executeRoute, options) {
    return async (ctx: any) => {
      const result = await executeRoute(ctx.request);
      if (!result.success) {
        ctx.status = result.statusCode;
        ctx.body = result.error;
        return;
      }
      const status = options.resolveStatus(ctx.request.method);
      ctx.status = status;
      ctx.body = status === 204 ? null : result.data;
    };
  },
};

const hex = createHexApp({
  container,
  framework: koaStrategy,  // custom strategy object
});
```

The developer only needs to implement one method: `createHandler`. It
receives beebear's `executeRoute` function and `options.resolveStatus`
for status code resolution. ~10 lines of code.

Custom strategies get the same method-based defaulting as built-in
strategies — `resolveStatus` is built by beebear, not by the strategy.

---

## Public API

### `HexAppOptions` (updated from hex.execute spec)

```ts
export type BuiltInFramework = 'express' | 'fastify' | 'hono';

export interface HexAppOptions {
  container: Container;
  errorMap?: Record<string, number>;
  framework?: BuiltInFramework | FrameworkStrategy;
}
```

- `framework` — optional. Accepts a string for built-in strategies or a
  custom `FrameworkStrategy` object for niche frameworks.
  If omitted, `httpAdapter()` throws when called. `execute()` still works.

### `FrameworkStrategy`

```ts
export interface FrameworkStrategy {
  createHandler(
    executeRoute: (req: any) => Promise<ExecuteResult<any>>,
    options: RouteOptions,
  ): any;
}
```

- `executeRoute` — function beebear provides. Takes the framework's
  request object, returns an `ExecuteResult`.
- `options` — contains `resolveStatus`, a function to get the success
  status code.
- Returns a framework-specific handler. Return type is `any` because
  each framework has a different handler signature.

### `RouteOptions`

```ts
export interface RouteOptions {
  resolveStatus: (method: string) => number;
}
```

- `resolveStatus(method)` — takes the HTTP method string (e.g., `"GET"`,
  `"POST"`, `"DELETE"`) and returns the success status code. Built by
  beebear inside `httpAdapter()`. Strategies call this instead of
  hardcoding status logic.

### `HttpAdapterOptions`

```ts
export interface HttpAdapterOptions<TInput> {
  toInput: (req: any) => TInput;
  status?: number;
}
```

- `toInput` — extracts use case input from the request. Always required.
- `status` — explicit success HTTP status code override. If provided,
  `resolveStatus` always returns this value regardless of HTTP method.
  If omitted, `resolveStatus` uses method-based defaults
  (POST → 201, DELETE → 204, else → 200).

### `hex.httpAdapter()`

```ts
httpAdapter<TInput, TOutput>(
  token: InjectionToken<UseCase<TInput, TOutput>>,
  options: HttpAdapterOptions<TInput>,
): any;
```

### Updated `HexApp` interface

```ts
export interface HexApp {
  execute<TInput, TOutput>(
    token: InjectionToken<UseCase<TInput, TOutput>>,
    input: TInput,
  ): Promise<ExecuteResult<TOutput>>;

  httpAdapter<TInput, TOutput>(
    token: InjectionToken<UseCase<TInput, TOutput>>,
    options: HttpAdapterOptions<TInput>,
  ): any;
}
```

---

## Behavior Rules

1. **`httpAdapter()` delegates to `hex.execute()` internally.**
   It doesn't duplicate the try/catch/error-mapping logic. It calls
   `execute()` and gets back an `ExecuteResult`. The strategy just
   maps that result to an HTTP response.

2. **`toInput(req)` is always required.**
   beebear doesn't auto-map `req.body`. Sometimes the input needs
   `req.params.id + req.body`, sometimes `req.query`. The developer
   knows their HTTP contract; `toInput` makes it explicit.

3. **`toInput` receives the raw framework request.**
   The request object is whatever the framework provides — Express's
   `req`, Fastify's `request`, Hono's `c.req`. beebear doesn't
   normalize or wrap it.

4. **Success status uses method-based defaults.**
   If `options.status` is not provided, the status code is inferred
   from the HTTP method: POST → 201, DELETE → 204, everything else → 200.
   If `options.status` is provided, it overrides the method default.
   This logic is encapsulated in `resolveStatus` and passed to the
   strategy — all strategies (built-in and custom) behave consistently.

5. **Error status comes from `ExecuteResult.statusCode`.**
   The strategy doesn't do error mapping — that's already done by
   `hex.execute()` via the `errorMap`. The strategy just sends the
   `statusCode` from the result. `resolveStatus` is never called
   in the error path.

6. **Non-business errors propagate to the framework's error handler.**
   If `hex.execute()` re-throws a non-business error (TypeError,
   connection failure), the strategy lets it propagate. In Express,
   that means calling `next(err)`. Each strategy handles this per
   its framework's convention.

7. **`httpAdapter()` throws if no framework strategy was provided.**
   If `createHexApp()` was called without `framework`, calling
   `httpAdapter()` throws:
   `"httpAdapter() requires a framework strategy. Provide one via createHexApp({ framework: ... })"`
   `execute()` still works — it doesn't need a strategy.

8. **Strategy is resolved once at startup.**
   The `framework` option in `createHexApp()` is resolved once during
   construction. If a string is passed, the built-in strategy is
   looked up immediately. Every `httpAdapter()` call uses the same
   resolved strategy instance. No detection or branching at request time.

9. **Unknown framework string throws at startup.**
   If the developer passes an unrecognized string (not `'express'`,
   `'fastify'`, or `'hono'`), `createHexApp()` throws immediately:
   `"Unknown framework: \"xxx\". Supported: express, fastify, hono.
   For other frameworks, pass a FrameworkStrategy object."`
   This catches typos and unsupported frameworks early.

10. **Custom `FrameworkStrategy` object is the escape hatch.**
    For any framework not in the built-in three, the developer passes
    a strategy object with a `createHandler` method. beebear uses it
    exactly like the built-in strategies — no difference in behavior.

11. **beebear has zero runtime framework dependencies.**
    The built-in strategies use `any` types internally. beebear does
    NOT import Express, Fastify, or Hono at runtime. The developer
    installs their chosen framework as a regular dependency. beebear
    declares Express, Fastify, and Hono as optional `peerDependencies`
    in `package.json`.

---

## Why Not Auto-Detect The Framework?

An earlier design idea was: beebear checks which HTTP framework is
installed in `node_modules` and picks the right strategy automatically.
Sounds convenient, but it causes more problems than it solves:

- **The developer doesn't know what happened.** If beebear silently
  picks Express, but the developer intended Fastify, the error messages
  would be confusing.

- **Multiple frameworks in node_modules.** A project might have both
  Express and Fastify installed — not because the developer uses both,
  but because some other package depends on one of them. Auto-detection
  would pick the wrong one.

- **ESM breaks `require.resolve`.** Auto-detection typically uses
  `require.resolve('express')` to check if a package exists. This
  doesn't work in ESM modules without workarounds. Since beebear is
  an ESM-first package, this would be fragile.

Instead, the developer passes one string — `framework: 'express'` —
and there's no ambiguity. Explicit, zero magic, one line.

---

## Full Usage Example

```ts
import express from 'express';
import { createHexApp, createContainer, Port } from 'beebear';
import type { UseCase } from 'beebear';

// 1. Container + bindings
const container = createContainer();
container.bind(RegisterUser, () => new RegisterUserService(/* deps */));
container.bind(GetUser, () => new GetUserService(/* deps */));
container.bind(DeleteUser, () => new DeleteUserService(/* deps */));
container.bind(Login, () => new LoginService(/* deps */));

// 2. Create hex app — just pass the framework name
const hex = createHexApp({
  container,
  framework: 'express',
  errorMap: { UserAlreadyExistsError: 409 },
});

// 3. Define routes — method defaults handle status codes
const app = express();
app.use(express.json());

// POST → 201 automatically
app.post('/users', hex.httpAdapter(RegisterUser, {
  toInput: (req) => ({ email: req.body.email, name: req.body.name }),
}));

// GET → 200 automatically
app.get('/users/:id', hex.httpAdapter(GetUser, {
  toInput: (req) => ({ id: req.params.id }),
}));

// DELETE → 204 automatically
app.delete('/users/:id', hex.httpAdapter(DeleteUser, {
  toInput: (req) => ({ id: req.params.id }),
}));

// POST but returns 200 (override the 201 default)
app.post('/login', hex.httpAdapter(Login, {
  toInput: (req) => ({ email: req.body.email, password: req.body.password }),
  status: 200,
}));

// 4. With middleware — developer's middleware, not beebear's
app.post('/admin/users',
  authenticate(),
  authorize('admin'),
  hex.httpAdapter(RegisterUser, {
    toInput: (req) => ({ ...req.body, requestedBy: req.user.id }),
  })
);

app.listen(3000);
```

Notice the developer doesn't write any strategy code and doesn't need
to specify status codes for common cases — `framework: 'express'` and
method defaults handle it.

---

## Peer Dependencies

beebear declares the three supported frameworks as optional peer
dependencies in `package.json`:

```json
{
  "peerDependencies": {
    "express": ">=4",
    "fastify": ">=4",
    "hono": ">=3"
  },
  "peerDependenciesMeta": {
    "express": { "optional": true },
    "fastify": { "optional": true },
    "hono": { "optional": true }
  }
}
```

The developer only installs the one they use. beebear itself has zero
runtime dependencies.

---

## Non-Goals

- No auto-detection of HTTP frameworks
- No request/response normalization or abstraction layer
- No middleware pipeline inside `httpAdapter` — middleware is the
  developer's concern, applied before `httpAdapter` in the router
- No response body transformation — the strategy sends `result.data`
  as-is. Reshaping is done in the use case or by the developer
- No content negotiation — JSON is the default convention. Custom
  strategies can do whatever they want
