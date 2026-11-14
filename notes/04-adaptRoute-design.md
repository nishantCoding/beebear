# Design: `adaptRoute` — The Driving Adapter Glue

> This is what beebear provides so developers never write try/catch + res.status() boilerplate.
> `adaptRoute` auto-detects the developer's HTTP framework and produces the right handler.

---

## The Problem

Every HTTP route in a hex arch app looks like this:

```ts
router.post('/users', async (req, res, next) => {
  try {
    const command = { email: req.body.email, password: req.body.password };
    const result = await registerUser.execute(command);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof UserAlreadyExistsError) res.status(409).json({ error: error.message });
    else if (error instanceof ValidationError) res.status(400).json({ error: error.message });
    else next(error);
  }
});
```

This is repeated for every single route. The only things that change are:
- Which use case to call
- How to extract the command from `req`
- The success status code

Everything else is boilerplate.

---

## The Solution: `adaptRoute` with Auto-Detected Framework Strategy

### Step 1: Create the hex app (once)

```ts
import { createHexApp } from 'beebear';

const hex = createHexApp({
  container,  // the DI container with all ports/adapters bound

  // Optional: explicitly specify framework. If omitted, beebear auto-detects
  // by checking which package is installed in node_modules.
  // framework: 'express',

  errorMap: {
    // Base domain errors (beebear ships these)
    ValidationError: 400,
    NotFoundError: 404,
    ConflictError: 409,
    UnauthorizedError: 401,
    ForbiddenError: 403,

    // Developer's custom domain errors
    UserAlreadyExistsError: 409,
    InsufficientBalanceError: 422,
  },
});
```

At this point, beebear detects the HTTP framework and permanently assigns the
right strategy. No branching happens at request time.

### Step 2: Define routes with `adaptRoute`

The API is identical regardless of which framework is detected:

```ts
// Works with Express, Fastify, Hono, Koa — same code

app.post('/users', hex.adaptRoute(RegisterUserUseCase, {
  toInput: (req) => ({ email: req.body.email, password: req.body.password }),
  status: 201,
}));

app.get('/users/:id', hex.adaptRoute(GetUserUseCase, {
  toInput: (req) => ({ id: req.params.id }),
}));

app.delete('/users/:id', hex.adaptRoute(DeleteUserUseCase, {
  toInput: (req) => ({ id: req.params.id }),
  status: 204,
}));
```

### With Middleware (Validation, AuthN, AuthZ)

Payload validation happens BEFORE `adaptRoute`. It's a boundary concern —
if the payload is malformed, the use case never runs.

```ts
app.post('/users',
  validate(RegisterUserSchema),    // 1. Payload validation (Zod — developer's choice)
  authenticate(),                   // 2. AuthN — who are you?
  authorize('admin', 'manager'),    // 3. AuthZ — are you allowed?
  hex.adaptRoute(RegisterUserUseCase, {
    toInput: (req) => ({
      ...req.body,                  // validated payload
      requestedBy: req.user.id,     // from authN middleware
    }),
    status: 201,
  })
);
```

`validate`, `authenticate`, `authorize` are the developer's middleware.
beebear doesn't own or provide them.

---

## Framework Strategy Pattern (Internal Architecture)

beebear does NOT use switch/case or if/else at request time. It uses the
**strategy pattern**: resolve the framework once at startup, permanently
assign the right handler factory.

### The Strategy Interface

```ts
// Every supported framework implements this contract
interface FrameworkStrategy {
  createHandler(
    core: (input: any) => Promise<ExecuteResult>,
    options: AdaptRouteOptions,
  ): Function;  // returns the framework-specific handler
}
```

### Strategy Implementations

```ts
class ExpressStrategy implements FrameworkStrategy {
  createHandler(core, options) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const result = await core(options.toInput(req));
      if (!result.success) return res.status(result.statusCode).json(result.error);
      if (options.status === 204) return res.status(204).send();
      res.status(options.status ?? 200).json(result.data);
    };
  }
}

class HonoStrategy implements FrameworkStrategy {
  createHandler(core, options) {
    return async (c: Context) => {
      const result = await core(options.toInput(c.req));
      if (!result.success) return c.json(result.error, result.statusCode);
      if (options.status === 204) return c.body(null, 204);
      return c.json(result.data, options.status ?? 200);
    };
  }
}

class FastifyStrategy implements FrameworkStrategy {
  createHandler(core, options) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await core(options.toInput(request));
      if (!result.success) return reply.status(result.statusCode).send(result.error);
      if (options.status === 204) return reply.status(204).send();
      reply.status(options.status ?? 200).send(result.data);
    };
  }
}
```

### Detection + Permanent Assignment

```ts
class HexApp {
  private strategy: FrameworkStrategy;

  constructor(config: HexAppConfig) {
    this.strategy = this.resolveStrategy(config.framework);
    // strategy is set ONCE. Never changes. No branching at request time.
  }

  private resolveStrategy(explicit?: string): FrameworkStrategy {
    const framework = explicit ?? this.detectFramework();

    const strategies: Record<string, FrameworkStrategy> = {
      express: new ExpressStrategy(),
      fastify: new FastifyStrategy(),
      hono: new HonoStrategy(),
    };

    if (!framework || !strategies[framework]) {
      throw new Error(
        `No supported HTTP framework detected. ` +
        `Install express, fastify, or hono — or specify explicitly: ` +
        `createHexApp({ framework: "express" })`
      );
    }

    return strategies[framework];
  }

  private detectFramework(): string | null {
    const checks: [string, string][] = [
      ['express', 'express'],
      ['fastify', 'fastify'],
      ['hono', 'hono'],
      ['koa', 'koa'],
    ];
    for (const [name, pkg] of checks) {
      try { require.resolve(pkg); return name; } catch {}
    }
    return null;
  }

  // adaptRoute delegates to the permanently assigned strategy
  adaptRoute<TCommand>(
    useCaseToken: PortToken<UseCase<TCommand, any>>,
    options: AdaptRouteOptions<TCommand>,
  ) {
    const core = async (input: TCommand): Promise<ExecuteResult> => {
      const useCase = this.container.resolve(useCaseToken);
      const result = await useCase.execute(input);
      return this.processResult(result);
    };

    return this.strategy.createHandler(core, options);
  }
}
```

### Why Strategy Pattern, Not Switch/Case

```
WRONG — switch/case runs on EVERY request:
┌──────────────────────────────────┐
│ adaptRoute called                │
│   → switch (this.framework)      │  ← branching on every request
│     case 'express': ...          │
│     case 'hono': ...             │
│     case 'fastify': ...          │
└──────────────────────────────────┘

RIGHT — strategy resolved ONCE at startup:
┌──────────────────────────────────┐
│ createHexApp()                   │
│   → this.strategy = new Express  │  ← resolved once, permanently
│     Strategy()                   │
└──────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────┐
│ adaptRoute called                │
│   → this.strategy.createHandler  │  ← no branching, direct call
│     (core, options)              │
└──────────────────────────────────┘
```

---

## The Core Function (Framework-Agnostic)

All strategies share the same core logic. This lives in beebear's core,
not in any strategy:

```ts
interface ExecuteResult {
  success: boolean;
  data?: any;
  error?: { message: string; code: string };
  statusCode?: number;
}

private processResult(result: any): ExecuteResult {
  // Handle Result pattern (Result.ok / Result.fail)
  if (result && typeof result === 'object' && 'isFailure' in result) {
    if (result.isFailure()) {
      const error = result.error;
      return {
        success: false,
        error: { message: error.message, code: error.code ?? error.constructor.name },
        statusCode: this.errorMap[error.constructor.name] ?? 400,
      };
    }
    return { success: true, data: result.value };
  }

  // Handle plain return value
  return { success: true, data: result };
}
```

Thrown DomainErrors are caught in `adaptRoute` before reaching `processResult`:

```ts
const core = async (input: TCommand): Promise<ExecuteResult> => {
  try {
    const useCase = this.container.resolve(useCaseToken);
    const result = await useCase.execute(input);
    return this.processResult(result);
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        success: false,
        error: { message: error.message, code: error.code },
        statusCode: this.errorMap[error.constructor.name] ?? 400,
      };
    }
    throw error;  // unknown error — let the framework's error handler deal with it
  }
};
```

---

## `hex.execute()` — Framework-Agnostic Fallback

If the developer uses an unsupported framework or raw Node.js `http`, they
can skip `adaptRoute` and use the core directly:

```ts
const result = await hex.execute(RegisterUserUseCase, {
  email: body.email,
  password: body.password,
});
// result = { success: true, data: ... } or { success: false, error: ..., statusCode: 409 }
```

The developer then maps `result` to their framework's response format manually.
`adaptRoute` is a convenience on top of `hex.execute`.

---

## Key Design Decisions

### 1. Container resolves the use case, not `new`

```ts
// WRONG — breaks DI, use case doesn't get its dependencies
const useCase = new RegisterUserUseCase();

// RIGHT — container injects UserRepository, EmailService, etc.
const useCase = container.resolve(RegisterUserUseCase);
```

### 2. Error map is global, not per-route

```ts
// WRONG — repeating error mappings on every route
app.post('/users', adaptRoute(RegisterUser, {
  toInput: (req) => req.body,
  errorMapping: { UserAlreadyExistsError: 409 },  // repeated everywhere
}));

// RIGHT — defined once at app creation
const hex = createHexApp({
  container,
  errorMap: { UserAlreadyExistsError: 409 },  // all routes inherit this
});
```

### 3. Both throw and Result patterns supported

```ts
// Style A: Throw (more common in Node.js)
class RegisterUser {
  async execute(cmd) {
    if (exists) throw new UserAlreadyExistsError(cmd.email);
    return user;
  }
}

// Style B: Result (functional style)
class RegisterUser {
  async execute(cmd) {
    if (exists) return Result.fail(new UserAlreadyExistsError(cmd.email));
    return Result.ok(user);
  }
}

// adaptRoute handles BOTH — no change needed in the route definition
```

### 4. `toInput` is always required

We don't auto-map `req.body` because:
- Sometimes the command needs `req.params.id` + `req.body` combined
- Sometimes it needs `req.query` values
- The developer knows their HTTP contract; we don't guess

```ts
// Combining params + body
app.put('/users/:id', hex.adaptRoute(UpdateUserUseCase, {
  toInput: (req) => ({ id: req.params.id, ...req.body }),
  status: 200,
}));

// Using query params
app.get('/users', hex.adaptRoute(SearchUsersUseCase, {
  toInput: (req) => ({ query: req.query.q, page: Number(req.query.page) }),
}));
```

### 5. Payload validation is NOT in adaptRoute

Structural validation (Zod, Joi, etc.) happens in middleware BEFORE `adaptRoute`.
It's a boundary concern. If payload is invalid, the use case never runs.

```ts
app.post('/users',
  validate(RegisterUserSchema),       // rejects with 400 if invalid
  hex.adaptRoute(RegisterUserUseCase, {
    toInput: (req) => req.body,     // only runs if validation passed
    status: 201,
  })
);
```

Business rule validation (uniqueness, authorization, domain constraints) stays
in the use case.

---

## Developer Experience Summary

What the developer writes per route: **2-4 lines**

```ts
app.post('/users',
  validate(RegisterUserSchema),
  authenticate(),
  authorize('admin'),
  hex.adaptRoute(RegisterUserUseCase, {
    toInput: (req) => ({ ...req.body, requestedBy: req.user.id }),
    status: 201,
  })
);
```

What the framework handles:
- Auto-detecting the HTTP framework (Express/Fastify/Hono)
- Resolving the use case from DI with all dependencies
- Calling execute()
- Mapping success → HTTP response
- Mapping domain errors → HTTP status codes (global errorMap)
- Catching unexpected errors
- Consistent JSON error response format
- Supporting both throw and Result patterns
