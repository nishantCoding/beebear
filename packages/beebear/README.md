# beebear

Lightweight hexagonal architecture framework for Node.js and TypeScript — decorator-free by default.

beebear handles the plumbing — DI container, use case execution, error mapping, HTTP adapter — so you focus on domain logic.

**Zero runtime dependencies. Works with Express, Fastify, and Hono.**

## Install

```bash
npm install beebear
```

## Quick Start

### 1. Define a port (domain interface + DI token)

```ts
// domain/ports/inbound/RegisterUser.ts
import { Port } from 'beebear';
import type { UseCase } from 'beebear';

export interface RegisterUser extends UseCase<
  { email: string; name: string },
  { id: string }
> {}

export const RegisterUser = Port<RegisterUser>('RegisterUser');
```

```ts
// domain/ports/outbound/UserRepository.ts
import { Port } from 'beebear';

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

export const UserRepository = Port<UserRepository>('UserRepository');
```

### 2. Implement the use case (pure business logic)

```ts
// domain/use-cases/RegisterUserService.ts
import { ConflictError } from 'beebear';
import type { RegisterUser } from '../ports/inbound/RegisterUser.js';
import type { UserRepository } from '../ports/outbound/UserRepository.js';

export class RegisterUserService implements RegisterUser {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(input: { email: string; name: string }) {
    const existing = await this.userRepo.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('Email already registered');
    }
    const id = crypto.randomUUID();
    await this.userRepo.save({ id, ...input });
    return { id };
  }
}
```

### 3. Implement the adapter (infrastructure)

```ts
// infrastructure/persistence/InMemoryUserRepository.ts
import type { UserRepository } from '../../domain/ports/outbound/UserRepository.js';

export class InMemoryUserRepository implements UserRepository {
  private users: Map<string, User> = new Map();

  async findByEmail(email: string) {
    return [...this.users.values()].find(u => u.email === email) ?? null;
  }

  async save(user: User) {
    this.users.set(user.id, user);
  }
}
```

### 4. Wire it up

```ts
// main.ts
import express from 'express';
import { createContainer, createHexApp } from 'beebear';
import { RegisterUser } from './domain/ports/inbound/RegisterUser.js';
import { UserRepository } from './domain/ports/outbound/UserRepository.js';
import { RegisterUserService } from './domain/use-cases/RegisterUserService.js';
import { InMemoryUserRepository } from './infrastructure/persistence/InMemoryUserRepository.js';

// Container
const container = createContainer();
container.bind(UserRepository, () => new InMemoryUserRepository());
container.bind(RegisterUser, (c) => new RegisterUserService(c.resolve(UserRepository)));
container.validate();

// Hex app
const hex = createHexApp({
  container,
  framework: 'express',
});

// Routes
const app = express();
app.use(express.json());

app.post('/users', hex.httpAdapter(RegisterUser, {
  toInput: (req) => ({ email: req.body.email, name: req.body.name }),
}));

app.listen(3000);
```

That's it. POST `/users` → 201 on success, 409 on conflict, 400 on validation error. No try/catch, no `res.status()` boilerplate.

## Features

### DI Container

Token-based, no decorators, no `reflect-metadata`.

```ts
import { createContainer, Port } from 'beebear';

const container = createContainer();

// Bind with factory function
container.bind(UserRepository, () => new PrismaUserRepository(prisma));

// Resolve dependencies
container.bind(RegisterUser, (c) => new RegisterUserService(c.resolve(UserRepository)));

// Validate at startup (catches missing bindings)
container.validate();
```

Singleton by default. Opt-in transient:

```ts
container.bind(token, factory, { lifecycle: 'transient' });
```

### Error Handling

Throw domain errors in use cases. beebear maps them to HTTP status codes automatically.

```ts
import { ValidationError, NotFoundError, ConflictError } from 'beebear';

// In a use case:
throw new ValidationError('Email is required');   // → 400
throw new NotFoundError('User not found');         // → 404
throw new ConflictError('Email already taken');    // → 409
```

Built-in error classes and their default status codes:

| Error Class | Status Code |
|---|---|
| `BusinessError` | 400 |
| `ValidationError` | 400 |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `UnauthorizedError` | 401 |
| `ForbiddenError` | 403 |

Override defaults:

```ts
const hex = createHexApp({
  container,
  errorMap: { ValidationError: 422 },
});
```

### HTTP Adapters

Works with Express, Fastify, and Hono out of the box.

```ts
const hex = createHexApp({ container, framework: 'express' });

// POST → 201, DELETE → 204, everything else → 200 (automatic)
app.post('/users', hex.httpAdapter(RegisterUser, {
  toInput: (req) => req.body,
}));

// Override default status
app.post('/login', hex.httpAdapter(Login, {
  toInput: (req) => req.body,
  status: 200,
}));
```

For other frameworks, pass a custom `FrameworkStrategy`. Example with Koa:

```ts
import type { FrameworkStrategy } from 'beebear';

const koaStrategy: FrameworkStrategy = {
  createHandler(executeRoute, options) {
    return async (ctx) => {
      const result = await executeRoute(ctx.request);
      if (!result.success) {
        ctx.status = result.statusCode;
        ctx.body = result.error;
        return;
      }
      const status = options.resolveStatus(ctx.method);
      ctx.status = status;
      ctx.body = status === 204 ? null : result.data;
    };
  },
};

const hex = createHexApp({
  container,
  framework: koaStrategy,
});

// Use like any built-in strategy
router.post('/users', hex.httpAdapter(RegisterUser, {
  toInput: (req) => req.body,
}));
```

### Lifecycle Hooks

Plug in logging, metrics, tracing — without polluting use cases.

All three hooks are optional. They fire around every `hex.execute()` call (and `httpAdapter`, which calls `execute` internally).

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

**Hook call order:**
- Success: `beforeExecute` → execute → `afterExecute`
- Business error: `beforeExecute` → execute → `onError` → `afterExecute`
- Non-business error: `beforeExecute` → execute → `onError` → `afterExecute` → re-throw

`afterExecute` always fires (like `finally`), regardless of success or failure.

**HookContext — what each hook sees:**

| Field | Type | `beforeExecute` | `afterExecute` | `onError` |
|---|---|---|---|---|
| `token` | `symbol` | DI token | DI token | DI token |
| `tokenName` | `string` | e.g. `"RegisterUser"` | e.g. `"RegisterUser"` | e.g. `"RegisterUser"` |
| `input` | `unknown` | the input passed to execute | the input passed to execute | the input passed to execute |
| `result` | `ExecuteResult \| undefined` | `undefined` | set (success or error result) | `undefined` |
| `error` | `unknown` | `undefined` | set if error occurred | the thrown error |
| `duration` | `number` | `0` | milliseconds (execution time only) | milliseconds |
| `state` | `Record<string, unknown>` | `{}` (empty) | whatever hooks put in it | whatever hooks put in it |

**`state` — passing data between hooks:**

`state` is a developer-owned object for sharing data across hooks within a single `execute()` call. beebear never reads or writes to it.

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

Each `execute()` call gets a fresh context and a fresh `state`. Hooks are synchronous (`() => void`). If a hook throws, the error propagates.

### Framework-Agnostic Execute

Use `hex.execute()` directly without HTTP:

```ts
const result = await hex.execute(RegisterUser, { email: 'a@b.com', name: 'Alice' });

if (result.success) {
  console.log(result.data); // { id: '...' }
} else {
  console.log(result.error); // { message: '...', code: '...' }
}
```

## API Reference

### Exports

```ts
// Token factories
Port<T>(name: string): InjectionToken<T>
Token<T>(name: string): InjectionToken<T>

// Container
createContainer(): Container
container.bind(token, factory, options?)
container.resolve(token)
container.has(token)
container.validate()
container.createScope()

// App
createHexApp(options: HexAppOptions): HexApp
hex.execute(token, input): Promise<ExecuteResult<T>>
hex.httpAdapter(token, options): FrameworkHandler

// Errors
BusinessError, ValidationError, NotFoundError,
ConflictError, UnauthorizedError, ForbiddenError

// Types
UseCase<TInput, TOutput>
ExecuteResult<T>
HexAppOptions, HexApp, HookContext, HexAppHooks
BuiltInFramework, FrameworkStrategy
Container, BindOptions, InjectionToken<T>
```

## Project Structure

Recommended layout for beebear apps:

```
src/
├── domain/
│   ├── models/              # Domain objects (plain TS)
│   ├── ports/
│   │   ├── inbound/         # Use case interfaces + tokens
│   │   └── outbound/        # Dependency interfaces + tokens
│   ├── use-cases/           # Use case implementations
│   └── errors/              # Custom domain error classes
└── infrastructure/
    ├── persistence/         # DB adapters
    ├── http/                # Routes
    └── services/            # External service adapters
```

## Philosophy

- **No decorators.** No `reflect-metadata`. Explicit factories over magic.
- **Zero runtime dependencies.** beebear core has nothing in `dependencies`.
- **Domain stays pure.** Use cases have zero framework imports.
- **Ports are interfaces.** Standard TypeScript interfaces with co-located tokens.
- **Fail fast.** Container validates at startup, not at first request.

## Upcoming Plugins

- `@beebear/decorators` — Optional decorator-based DI for teams that prefer decorators
- `@beebear/ddd` — Entity, ValueObject, AggregateRoot, DomainEvent
- `@beebear/testing` — Test container, adapter overrides, helpers
- `@beebear/mcp` — MCP server for AI coding assistants

## License

MIT
