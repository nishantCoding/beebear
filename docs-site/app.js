/* ── Documentation Content ─────────────────────────────────── */

const DOCS = {};

DOCS.overview = `# beebear — Hexagonal Architecture Framework

## What is beebear?

beebear is a lightweight, **decorator-free** framework that provides the plumbing for
hexagonal architecture (ports and adapters) in Node.js/TypeScript. It has **zero runtime
dependencies**. Developers focus on domain logic and adapter implementations; beebear
handles dependency injection, error mapping, use case execution, and transport abstraction.

## Core Concepts

### Hexagonal Architecture
The application is split into an inner hexagon (domain logic) and outer adapters
(infrastructure). The domain defines **ports** (interfaces) that adapters implement.
Dependencies always point inward — the domain never imports infrastructure code.

### Ports
Ports are standard TypeScript interfaces with co-located runtime tokens created via
\`Port<T>(name)\`. Ports live inside the domain. There are two kinds:
- **Inbound (driving) ports** — use case interfaces that the outside world calls in
- **Outbound (driven) ports** — repository/service interfaces the domain depends on

### Adapters
Adapters live in infrastructure and implement port interfaces:
- **Driving adapters** — HTTP controllers, CLI handlers, message consumers
- **Driven adapters** — database repositories, email services, payment gateways

### Use Cases
Class-based by default. A use case implements a driving port and depends on driven ports.
Use cases live inside the hexagon and have zero framework imports.

### DI Container
Token-based, no decorators, no \`reflect-metadata\`. Explicit factory functions.
Singleton by default with transient and scoped opt-in. Startup validation catches
missing bindings before the app starts.

## What beebear Handles vs What You Handle

**beebear provides:**
- \`Port<T>()\` / \`Token<T>()\` — typed DI tokens
- \`createContainer()\` — DI container with bind/resolve/validate
- \`createHexApp()\` — ties container, error mapping, HTTP adapters, and hooks together
- Error base classes with automatic HTTP status mapping
- Transport abstraction via \`httpAdapter()\` (Express, Fastify, Hono)
- Lifecycle hooks: \`beforeExecute\`, \`afterExecute\`, \`onError\`

**You provide:**
- HTTP server (Express, Fastify, Hono)
- Database client (Prisma, Drizzle, Mongoose)
- Validation library (Zod, Joi, etc.) — used in middleware before routes
- Authentication / authorization
- Logging, tracing, metrics (plug into lifecycle hooks)

## Plugin Ecosystem

- **@beebear-plugins/di-decorators** — Opt-in decorator-based DI (\`@Injectable\`, \`@Inject\`).
  Requires only \`experimentalDecorators: true\` in tsconfig (no \`reflect-metadata\`).
- **@beebear-plugins/ddd** — Domain-Driven Design building blocks: \`ValueObject\`,
  \`Entity\`, \`AggregateRoot\`, \`DomainEvent\`. Zero dependencies, standalone.
- **@beebear-plugins/mcp** — MCP server that teaches AI coding assistants the beebear way.
`;

DOCS.api = `# API Reference

## Token & Port

\`\`\`ts
type InjectionToken<T> = symbol & { readonly __type?: T };

function Token<T>(name: string): InjectionToken<T>;
function Port<T>(name: string): InjectionToken<T>;
\`\`\`

- \`Token<T>(name)\` creates a unique branded symbol for DI. Throws if \`name\` is already used.
- \`Port<T>(name)\` is a semantic alias for \`Token\`. Use \`Port\` for hexagonal ports, \`Token\` for general dependencies.
- The phantom type \`T\` enables type-safe resolution — \`container.resolve(token)\` returns \`T\`.

## Container

\`\`\`ts
function createContainer(): Container;

interface Container {
  bind<T>(token: InjectionToken<T>, factory: (c: Container) => T,
          options?: BindOptions): void;
  bind<T>(token: InjectionToken<T>, constructor: new (...args: any[]) => T,
          deps: InjectionToken[], options?: BindOptions): void;
  resolve<T>(token: InjectionToken<T>): T;
  has<T>(token: InjectionToken<T>): boolean;
  validate(): void;
  createScope(): Container;
}

interface BindOptions {
  lifecycle?: 'singleton' | 'transient' | 'scoped';
}
\`\`\`

- \`bind(token, factory)\` — factory receives the container for resolving dependencies.
- \`bind(token, Constructor, [depTokens])\` — shorthand, container resolves deps and passes to constructor.
- \`resolve(token)\` — returns the instance. Singleton by default (cached after first resolve).
- \`has(token)\` — check if a binding exists.
- \`validate()\` — throws if any binding has unresolvable dependencies. Call at startup.
- \`createScope()\` — child container for scoped lifecycles.

## Errors

\`\`\`ts
class BusinessError extends Error {
  code: string;
  name: string;
  constructor(message: string, code?: string);
}

class ValidationError extends BusinessError {}   // 400
class NotFoundError extends BusinessError {}      // 404
class ConflictError extends BusinessError {}      // 409
class UnauthorizedError extends BusinessError {}  // 401
class ForbiddenError extends BusinessError {}     // 403
\`\`\`

All error classes accept \`(message: string, code?: string)\`. The \`code\` defaults to a
snake_case derivation of the class name (e.g. \`VALIDATION_ERROR\`).

## UseCase

\`\`\`ts
interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
\`\`\`

## createHexApp

\`\`\`ts
function createHexApp(options: HexAppOptions): HexApp;

interface HexAppOptions {
  container: Container;
  errorMap?: Record<string, number>;
  framework?: BuiltInFramework | FrameworkStrategy;
  hooks?: HexAppHooks;
}

type BuiltInFramework = 'express' | 'fastify' | 'hono';

interface HexApp {
  execute<TInput, TOutput>(
    token: InjectionToken<UseCase<TInput, TOutput>>,
    input: TInput
  ): Promise<ExecuteResult<TOutput>>;

  httpAdapter<TInput, TOutput>(
    token: InjectionToken<UseCase<TInput, TOutput>>,
    options: HttpAdapterOptions<TInput>
  ): any;
}

interface HttpAdapterOptions<TInput> {
  toInput: (req: any) => TInput;
  status?: number;
}

type ExecuteResult<T> =
  | { success: true; data: T }
  | { success: false; error: { message: string; code: string };
      statusCode: number };
\`\`\`

Default status by HTTP method: POST returns 201, DELETE returns 204, all others return 200.

Default error-to-status map: BusinessError 400, ValidationError 400, NotFoundError 404,
ConflictError 409, UnauthorizedError 401, ForbiddenError 403.

## Lifecycle Hooks

\`\`\`ts
interface HookContext {
  token: symbol;
  tokenName: string;
  input: unknown;
  result?: ExecuteResult<unknown>;
  error?: unknown;
  duration: number;
  state: Record<string, unknown>;
}

interface HexAppHooks {
  beforeExecute?: (context: HookContext) => void;
  afterExecute?: (context: HookContext) => void;
  onError?: (context: HookContext) => void;
}
\`\`\`

- \`state\` is a mutable bag shared across all three hooks for a single execution.
- \`duration\` is 0 in \`beforeExecute\`, measured in ms in \`afterExecute\` and \`onError\`.
`;

DOCS.patterns = `# Patterns

## 1. Port Definition

Ports are TypeScript interfaces with co-located runtime tokens. Inbound ports define
what the outside world can ask the domain to do. Outbound ports define what the domain
needs from infrastructure.

\`\`\`ts
// src/domain/ports/inbound/create-order.port.ts
import { Port } from 'beebear';
import type { UseCase } from 'beebear';

export interface CreateOrderInput {
  customerId: string;
  items: { productId: string; quantity: number }[];
}
export interface CreateOrderOutput {
  orderId: string;
}
export type CreateOrderPort = UseCase<CreateOrderInput, CreateOrderOutput>;
export const CreateOrderPort = Port<CreateOrderPort>('CreateOrder');

// src/domain/ports/outbound/order-repository.port.ts
import { Port } from 'beebear';

export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
}
export const OrderRepository = Port<OrderRepository>('OrderRepository');
\`\`\`

## 2. Use Case Implementation

Use cases implement inbound ports and depend on outbound ports. They contain
only domain logic — no framework imports.

\`\`\`ts
// src/domain/use-cases/create-order.use-case.ts
import type { CreateOrderPort, CreateOrderInput, CreateOrderOutput }
  from '../ports/inbound/create-order.port';
import type { OrderRepository }
  from '../ports/outbound/order-repository.port';
import { NotFoundError } from 'beebear';

export class CreateOrderUseCase implements CreateOrderPort {
  constructor(private readonly orderRepo: OrderRepository) {}

  async execute(input: CreateOrderInput): Promise<CreateOrderOutput> {
    if (input.items.length === 0) {
      throw new NotFoundError('Order must have at least one item');
    }
    const order = Order.create(input.customerId, input.items);
    await this.orderRepo.save(order);
    return { orderId: order.id };
  }
}
\`\`\`

## 3. Adapter Implementation

Driven adapters implement outbound port interfaces and live in infrastructure.

\`\`\`ts
// src/infrastructure/persistence/prisma-order-repository.ts
import type { OrderRepository }
  from '../../domain/ports/outbound/order-repository.port';
import { PrismaClient } from '@prisma/client';

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(order: Order): Promise<void> {
    await this.prisma.order.create({ data: order.toPersistence() });
  }
  async findById(id: string): Promise<Order | null> {
    const row = await this.prisma.order.findUnique({ where: { id } });
    return row ? Order.fromPersistence(row) : null;
  }
}
\`\`\`

## 4. Container Binding

\`\`\`ts
import { createContainer, Token } from 'beebear';
import { OrderRepository }
  from './domain/ports/outbound/order-repository.port';
import { CreateOrderPort }
  from './domain/ports/inbound/create-order.port';
import { PrismaOrderRepository }
  from './infrastructure/persistence/prisma-order-repository';
import { CreateOrderUseCase }
  from './domain/use-cases/create-order.use-case';
import { PrismaClient } from '@prisma/client';

const PrismaToken = Token<PrismaClient>('PrismaClient');
const container = createContainer();

// Factory form — full control
container.bind(PrismaToken, () => new PrismaClient());

// Factory form — resolve dependencies from container
container.bind(OrderRepository,
  (c) => new PrismaOrderRepository(c.resolve(PrismaToken)));

// Constructor shorthand — deps array maps to constructor params
container.bind(CreateOrderPort, CreateOrderUseCase, [OrderRepository]);

// Transient lifecycle
container.bind(SomeToken, SomeClass, [], { lifecycle: 'transient' });

// Validate all bindings at startup (catches missing deps early)
container.validate();
\`\`\`

## 5. HTTP Routes with httpAdapter

\`\`\`ts
import express from 'express';
import { createHexApp } from 'beebear';
import { CreateOrderPort }
  from './domain/ports/inbound/create-order.port';

const app = express();
const hex = createHexApp({ container, framework: 'express' });

// toInput extracts use case input from the request
app.post('/orders', hex.httpAdapter(CreateOrderPort, {
  toInput: (req) => ({
    customerId: req.body.customerId,
    items: req.body.items,
  }),
}));

// Method defaults: POST -> 201, DELETE -> 204, else -> 200
// Override with status option:
app.get('/orders/:id', hex.httpAdapter(GetOrderPort, {
  toInput: (req) => ({ orderId: req.params.id }),
  status: 200,
}));
\`\`\`

## 6. Lifecycle Hooks

\`\`\`ts
const hex = createHexApp({
  container,
  hooks: {
    beforeExecute(ctx) {
      ctx.state.startTime = Date.now();
      console.log(\`Executing \${ctx.tokenName} with input:\`, ctx.input);
    },
    afterExecute(ctx) {
      console.log(\`\${ctx.tokenName} completed in \${ctx.duration}ms\`);
    },
    onError(ctx) {
      console.error(\`\${ctx.tokenName} failed after \${ctx.duration}ms:\`,
                     ctx.error);
    },
  },
});
\`\`\`

The \`state\` object is shared across all three hooks for a single execution, allowing
\`beforeExecute\` to store data that \`afterExecute\` or \`onError\` reads.

## 7. Third-Party DI (Escape Hatch)

If you already use another DI container, wrap it to match beebear's Container interface:

\`\`\`ts
import { createHexApp } from 'beebear';
import type { Container } from 'beebear';

function wrapExternalContainer(external: ExternalDI): Container {
  return {
    bind: (token, factory) => external.register(token, factory),
    resolve: (token) => external.get(token),
    has: (token) => external.has(token),
    validate: () => { /* no-op or custom logic */ },
    createScope: () => wrapExternalContainer(external.createChild()),
  };
}

const hex = createHexApp({
  container: wrapExternalContainer(myExternalDI)
});
\`\`\`
`;

DOCS['project-structure'] = `# Project Structure

## Standard Layout

\`\`\`
src/
├── domain/
│   ├── models/              # Domain objects (plain TS, no framework imports)
│   ├── ports/
│   │   ├── inbound/         # Driving ports (use case interfaces + tokens)
│   │   └── outbound/        # Driven ports (repo/service interfaces + tokens)
│   ├── use-cases/           # Use case implementations
│   └── errors/              # Domain error subclasses
└── infrastructure/
    ├── persistence/         # Driven adapters (Prisma, Mongo, in-memory)
    ├── http/                # Driving adapters (controllers/routes)
    └── services/            # Driven adapters (email, payment, etc.)
\`\`\`

## What Goes Where

### domain/models/
Plain TypeScript classes and types representing domain concepts. No framework imports,
no database annotations. These are the core business objects.

\`\`\`ts
// domain/models/order.ts
export class Order {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public readonly items: OrderItem[],
    public readonly status: OrderStatus,
  ) {}
}
\`\`\`

### domain/ports/inbound/
Driving port interfaces that define what the outside world can ask the domain to do.
Each file exports a TypeScript interface (extending \`UseCase<TInput, TOutput>\`) and
a co-located \`Port<T>()\` token.

\`\`\`ts
// domain/ports/inbound/create-order.port.ts
import { Port } from 'beebear';
import type { UseCase } from 'beebear';

export interface CreateOrderInput { customerId: string; items: Item[] }
export interface CreateOrderOutput { orderId: string }
export type CreateOrderPort = UseCase<CreateOrderInput, CreateOrderOutput>;
export const CreateOrderPort = Port<CreateOrderPort>('CreateOrder');
\`\`\`

### domain/ports/outbound/
Driven port interfaces that define what the domain needs from infrastructure (repos,
services). The domain calls these; infrastructure implements them.

\`\`\`ts
// domain/ports/outbound/order-repository.port.ts
import { Port } from 'beebear';

export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
}
export const OrderRepository = Port<OrderRepository>('OrderRepository');
\`\`\`

### domain/use-cases/
Use case classes that implement inbound ports. They receive outbound ports via
constructor injection and contain only business logic.

### domain/errors/
Custom domain error subclasses extending beebear's error hierarchy. Example:
\`OrderAlreadyShippedError extends ConflictError\`.

### infrastructure/persistence/
Driven adapter implementations for data persistence. Implements outbound repository
ports using Prisma, Drizzle, Mongoose, or plain SQL.

### infrastructure/http/
Driving adapters — Express/Fastify/Hono route files that use \`hex.httpAdapter()\` to
connect HTTP endpoints to use case tokens.

\`\`\`ts
// infrastructure/http/order.routes.ts
import { Router } from 'express';
import { CreateOrderPort }
  from '../../domain/ports/inbound/create-order.port';

export function orderRoutes(hex: HexApp): Router {
  const router = Router();
  router.post('/', hex.httpAdapter(CreateOrderPort, {
    toInput: (req) => ({
      customerId: req.body.customerId,
      items: req.body.items,
    }),
  }));
  return router;
}
\`\`\`

### infrastructure/services/
Driven adapters for external services (email providers, payment gateways, etc.).
Implements outbound service ports.

## Key Rules

1. **domain/ never imports from infrastructure/** — dependencies point inward.
2. **Ports are owned by the domain** — defined in domain/ports, implemented in infrastructure.
3. **Use cases depend on port interfaces**, not concrete implementations.
4. **Container wiring** happens at the app entry point (e.g., \`main.ts\` or \`app.ts\`),
   where you bind concrete adapters to port tokens.
5. **Validation middleware** (Zod, Joi) runs in infrastructure/http before \`httpAdapter\`.
`;

DOCS.errors = `# Error Handling

## Error Hierarchy

\`\`\`
Error
└── BusinessError          (base, default 400)
    ├── ValidationError    (400 — invalid input)
    ├── NotFoundError      (404 — resource not found)
    ├── ConflictError      (409 — state conflict)
    ├── UnauthorizedError  (401 — not authenticated)
    └── ForbiddenError     (403 — not authorized)
\`\`\`

All error classes share the same constructor signature:

\`\`\`ts
constructor(message: string, code?: string)
\`\`\`

The \`code\` property defaults to a snake_case derivation of the class name (e.g.
\`VALIDATION_ERROR\`). The \`name\` property is set to the class name automatically.

## When to Use Each Error

| Error Class | HTTP Status | When to Throw |
|---|---|---|
| BusinessError | 400 | General domain rule violation |
| ValidationError | 400 | Input fails business validation inside the use case |
| NotFoundError | 404 | Requested entity does not exist |
| ConflictError | 409 | Operation conflicts with current state (duplicates) |
| UnauthorizedError | 401 | Caller identity is unknown or token is invalid |
| ForbiddenError | 403 | Caller is authenticated but lacks permission |

## Default Error-to-Status Map

\`createHexApp\` ships with a built-in map:

\`\`\`ts
{
  BusinessError: 400,
  ValidationError: 400,
  NotFoundError: 404,
  ConflictError: 409,
  UnauthorizedError: 401,
  ForbiddenError: 403,
}
\`\`\`

Unknown errors (not in the map) result in HTTP 500.

## Custom Error Subclasses

Extend any built-in error to create domain-specific errors:

\`\`\`ts
import { ConflictError } from 'beebear';

export class OrderAlreadyShippedError extends ConflictError {
  constructor(orderId: string) {
    super(\`Order \${orderId} has already been shipped\`,
          'ORDER_ALREADY_SHIPPED');
  }
}
\`\`\`

Custom subclasses automatically inherit the parent's HTTP status mapping. An
\`OrderAlreadyShippedError\` maps to 409 because it extends \`ConflictError\`.

## Overriding the Error Map

Use the \`errorMap\` option in \`createHexApp\` to add or override mappings:

\`\`\`ts
import { createHexApp } from 'beebear';

const hex = createHexApp({
  container,
  errorMap: {
    RateLimitError: 429,
    PaymentRequiredError: 402,
    // Override a built-in:
    BusinessError: 422,
  },
});
\`\`\`

The map key is the error class \`name\` property (the class name string). beebear checks
the error's prototype chain, so subclass mappings take priority over parent mappings.

## Usage in Use Cases

\`\`\`ts
import { NotFoundError, ValidationError } from 'beebear';

export class GetOrderUseCase implements GetOrderPort {
  constructor(private readonly orderRepo: OrderRepository) {}

  async execute(input: { orderId: string }): Promise<Order> {
    if (!input.orderId) {
      throw new ValidationError('orderId is required');
    }
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) {
      throw new NotFoundError(\`Order \${input.orderId} not found\`);
    }
    return order;
  }
}
\`\`\`

## ExecuteResult Shape

When errors are thrown inside \`hex.execute()\` or \`hex.httpAdapter()\`, they are caught
and mapped:

\`\`\`ts
// Success
{ success: true, data: { orderId: '123' } }

// Error
{
  success: false,
  error: { message: 'Order not found', code: 'NOT_FOUND_ERROR' },
  statusCode: 404
}
\`\`\`

The \`httpAdapter\` sends the JSON error response with the mapped status code automatically.
\`hex.execute()\` returns the \`ExecuteResult\` object for you to handle programmatically.
`;

DOCS['http-adapters'] = `# HTTP Adapters

## Overview

beebear uses a **strategy pattern** for HTTP framework support. The framework strategy
is resolved once at startup — no branching at request time. Supported built-in frameworks:
Express, Fastify, and Hono.

## Framework Selection

\`\`\`ts
import { createHexApp } from 'beebear';

// Explicit selection (recommended)
const hex = createHexApp({ container, framework: 'express' });
const hex = createHexApp({ container, framework: 'fastify' });
const hex = createHexApp({ container, framework: 'hono' });

// Auto-detection: beebear calls require.resolve() at startup
// to find which HTTP framework is installed
const hex = createHexApp({ container });
\`\`\`

## httpAdapter Usage

\`httpAdapter\` creates a framework-native request handler that extracts input, runs
the use case, and sends the response.

\`\`\`ts
interface HttpAdapterOptions<TInput> {
  toInput: (req: any) => TInput;   // always required
  status?: number;                  // override default status code
}
\`\`\`

### Express Example

\`\`\`ts
import express from 'express';
import { createHexApp } from 'beebear';
import { CreateOrderPort }
  from './domain/ports/inbound/create-order.port';
import { GetOrderPort }
  from './domain/ports/inbound/get-order.port';
import { DeleteOrderPort }
  from './domain/ports/inbound/delete-order.port';

const app = express();
app.use(express.json());

const hex = createHexApp({ container, framework: 'express' });

app.post('/orders', hex.httpAdapter(CreateOrderPort, {
  toInput: (req) => ({
    customerId: req.body.customerId,
    items: req.body.items,
  }),
}));

app.get('/orders/:id', hex.httpAdapter(GetOrderPort, {
  toInput: (req) => ({ orderId: req.params.id }),
}));

app.delete('/orders/:id', hex.httpAdapter(DeleteOrderPort, {
  toInput: (req) => ({ orderId: req.params.id }),
}));
\`\`\`

### Fastify Example

\`\`\`ts
import Fastify from 'fastify';
import { createHexApp } from 'beebear';

const fastify = Fastify();
const hex = createHexApp({ container, framework: 'fastify' });

fastify.post('/orders', hex.httpAdapter(CreateOrderPort, {
  toInput: (req) => ({
    customerId: req.body.customerId,
    items: req.body.items,
  }),
}));
\`\`\`

### Hono Example

\`\`\`ts
import { Hono } from 'hono';
import { createHexApp } from 'beebear';

const app = new Hono();
const hex = createHexApp({ container, framework: 'hono' });

app.post('/orders', hex.httpAdapter(CreateOrderPort, {
  toInput: (c) => ({
    customerId: c.req.json().customerId,
  }),
}));
\`\`\`

## Default Status Codes by Method

| HTTP Method | Default Status |
|---|---|
| POST | 201 |
| DELETE | 204 |
| GET | 200 |
| PUT | 200 |
| PATCH | 200 |

Override with the \`status\` option:

\`\`\`ts
app.post('/orders', hex.httpAdapter(CreateOrderPort, {
  toInput: (req) => req.body,
  status: 200,   // override POST's default 201
}));
\`\`\`

## Framework-Agnostic Fallback (hex.execute)

Use \`hex.execute()\` when you need to run a use case outside of HTTP — in tests,
CLI scripts, message consumers, or WebSocket handlers:

\`\`\`ts
const result = await hex.execute(CreateOrderPort, {
  customerId: '123',
  items: [{ productId: 'abc', quantity: 2 }],
});

if (result.success) {
  console.log('Order created:', result.data.orderId);
} else {
  console.error(result.error.message, result.statusCode);
}
\`\`\`

## Custom FrameworkStrategy

Implement a custom strategy for unsupported frameworks or non-HTTP transports:

\`\`\`ts
import { createHexApp } from 'beebear';

const customStrategy = {
  createHandler(core, options) {
    return async (frameworkReq, frameworkRes) => {
      const input = options.toInput(frameworkReq);
      const result = await core.execute(input);
      if (result.success) {
        frameworkRes.status(options.status).json(result.data);
      } else {
        frameworkRes.status(result.statusCode).json(result.error);
      }
    };
  },
};

const hex = createHexApp({ container, framework: customStrategy });
\`\`\`

## Payload Validation

Structural/payload validation (Zod, Joi, etc.) happens in middleware **before**
\`httpAdapter\`. It is a boundary concern, not the framework's job:

\`\`\`ts
import { z } from 'zod';

const CreateOrderSchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().positive(),
  })),
});

app.post('/orders',
  (req, res, next) => {
    const parsed = CreateOrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    req.body = parsed.data;
    next();
  },
  hex.httpAdapter(CreateOrderPort, { toInput: (req) => req.body }),
);
\`\`\`
`;

DOCS.decorators = `# @beebear-plugins/di-decorators

## Overview

Optional decorator-based DI plugin for beebear. Provides \`@Injectable\` and \`@Inject\`
decorators for developers who prefer annotation-style dependency injection. Requires
only \`experimentalDecorators: true\` in tsconfig — no \`reflect-metadata\` needed.

## Installation

\`\`\`bash
npm install @beebear-plugins/di-decorators
\`\`\`

**tsconfig.json** — only one flag needed:
\`\`\`json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
\`\`\`

## API

### @Injectable(token, options?)

Class decorator. Registers the class in a global registry for auto-binding.

\`\`\`ts
import { Injectable, Inject }
  from '@beebear-plugins/di-decorators';
import { CreateOrderPort }
  from '../ports/inbound/create-order.port';
import { OrderRepository }
  from '../ports/outbound/order-repository.port';

@Injectable(CreateOrderPort)
export class CreateOrderUseCase {
  constructor(
    @Inject(OrderRepository)
    private readonly orderRepo: OrderRepository,
  ) {}

  async execute(input: CreateOrderInput)
    : Promise<CreateOrderOutput> {
    // domain logic
  }
}
\`\`\`

### @Inject(token)

Parameter decorator. Marks a constructor parameter as a dependency to be resolved
from the container.

### withDecorators(container)

Reads the global registry populated by \`@Injectable\`, binds all registered classes
to the container, and returns a \`DecoratorContainer\`.

\`\`\`ts
import { createContainer } from 'beebear';
import { withDecorators }
  from '@beebear-plugins/di-decorators';

// Import decorated classes to trigger registration
import './domain/use-cases/create-order.use-case';
import './infrastructure/persistence/prisma-order-repository';

const baseContainer = createContainer();
// Bind non-decorated dependencies manually
baseContainer.bind(PrismaToken, () => new PrismaClient());

const container = withDecorators(baseContainer);
// container now has all @Injectable bindings applied
\`\`\`

### DecoratorContainer

Returned by \`withDecorators()\`. Provides \`resolve\`, \`has\`, \`validate\`, and
\`createScope\` — but **not** \`bind\`. All manual bindings must be done on the base
container before calling \`withDecorators\`.

\`\`\`ts
interface DecoratorContainer {
  resolve<T>(token: InjectionToken<T>): T;
  has<T>(token: InjectionToken<T>): boolean;
  validate(): void;
  createScope(): Container;
}
\`\`\`

### clearRegistry()

Clears the global decorator registry. Use in tests to ensure a clean state:

\`\`\`ts
import { clearRegistry }
  from '@beebear-plugins/di-decorators';

beforeEach(() => {
  clearRegistry();
});
\`\`\`

## Lifecycle Options

Pass lifecycle as the second argument to \`@Injectable\`:

\`\`\`ts
@Injectable(MyToken, { lifecycle: 'transient' })
export class MyService { ... }

@Injectable(MyToken, { lifecycle: 'scoped' })
export class MyScopedService { ... }

// Default is 'singleton'
@Injectable(MyToken)
export class MySingleton { ... }
\`\`\`

## Complete Example

\`\`\`ts
// domain/ports/outbound/email-service.port.ts
import { Port } from 'beebear';

export interface EmailService {
  send(to: string, subject: string, body: string): Promise<void>;
}
export const EmailService = Port<EmailService>('EmailService');

// infrastructure/services/sendgrid-email.service.ts
import { Injectable }
  from '@beebear-plugins/di-decorators';
import { EmailService }
  from '../../domain/ports/outbound/email-service.port';

@Injectable(EmailService)
export class SendGridEmailService implements EmailService {
  async send(to: string, subject: string, body: string)
    : Promise<void> {
    // SendGrid API call
  }
}

// main.ts
import { createContainer, createHexApp } from 'beebear';
import { withDecorators }
  from '@beebear-plugins/di-decorators';
import './infrastructure/services/sendgrid-email.service';

const container = withDecorators(createContainer());
container.validate();

const hex = createHexApp({ container });
\`\`\`

## When to Use Decorators vs Manual Binding

- **Use decorators** when you prefer annotation-style DI and want less boilerplate
  in the wiring file.
- **Use manual binding** when you want full explicit control, need to avoid
  \`experimentalDecorators\`, or are writing library code where implicit globals are
  undesirable.
- You can mix both: manually bind some tokens, decorate others, then call
  \`withDecorators()\` to merge them.
`;

DOCS.ddd = `# @beebear-plugins/ddd

## Overview

Domain-Driven Design building blocks for beebear. Provides \`ValueObject\`, \`Entity\`,
\`AggregateRoot\`, and \`DomainEvent\` base classes. Zero dependencies — works standalone
or with beebear.

## Installation

\`\`\`bash
npm install @beebear-plugins/ddd
\`\`\`

## ValueObject<TProps>

Abstract base class for immutable objects defined by their structural properties
(no identity). Uses structural equality and freezes props at construction.

\`\`\`ts
import { ValueObject } from '@beebear-plugins/ddd';

interface MoneyProps {
  amount: number;
  currency: string;
}

export class Money extends ValueObject<MoneyProps> {
  protected validate(props: MoneyProps): void {
    if (props.amount < 0)
      throw new Error('Amount cannot be negative');
    if (!props.currency)
      throw new Error('Currency is required');
  }

  get amount(): number { return this.props.amount; }
  get currency(): string { return this.props.currency; }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('Cannot add different currencies');
    }
    return new Money({
      amount: this.amount + other.amount,
      currency: this.currency,
    });
  }
}

const a = new Money({ amount: 100, currency: 'USD' });
const b = new Money({ amount: 100, currency: 'USD' });
a.equals(b); // true — structural equality
\`\`\`

Key behaviors:
- \`props\` are frozen (Object.freeze) after construction — immutable at runtime.
- \`validate(props)\` hook is called during construction. Override to add rules.
- \`equals(other)\` compares all props by value (deep structural equality).

## Entity<TId>

Abstract base class for objects with a unique identity. Identity-based equality.
\`TId\` must be \`string\` or \`number\`.

\`\`\`ts
import { Entity } from '@beebear-plugins/ddd';

export class User extends Entity<string> {
  constructor(
    id: string,
    private _name: string,
    private _email: string,
  ) {
    super(id);
  }

  get name(): string { return this._name; }
  get email(): string { return this._email; }

  changeName(name: string): void {
    if (!name.trim())
      throw new Error('Name cannot be empty');
    this._name = name;
  }
}

const user1 = new User('abc', 'Alice', 'alice@example.com');
const user2 = new User('abc', 'Alice Updated', 'alice@example.com');
user1.equals(user2); // true — same id
\`\`\`

Key behaviors:
- \`id\` is set via \`super(id)\` and made runtime-immutable using \`Object.defineProperty\`.
- \`equals(other)\` compares by \`id\` only, ignoring other properties.

## AggregateRoot<TId>

Extends \`Entity\` with domain event support. An aggregate root is the entry point
for a cluster of related entities and value objects.

\`\`\`ts
import { AggregateRoot } from '@beebear-plugins/ddd';

export class Order extends AggregateRoot<string> {
  private items: OrderItem[] = [];
  private _status: OrderStatus = 'draft';

  get status(): OrderStatus { return this._status; }

  addItem(productId: string, quantity: number): void {
    this.items.push(new OrderItem(productId, quantity));
    this.addEvent(
      new OrderItemAdded(this.id, productId, quantity)
    );
  }

  submit(): void {
    if (this.items.length === 0)
      throw new Error('Cannot submit empty order');
    this._status = 'submitted';
    this.addEvent(new OrderSubmitted(this.id));
  }
}

const order = new Order('order-1');
order.addItem('prod-1', 2);
order.submit();

const events = order.getEvents();
// [OrderItemAdded, OrderSubmitted]
order.clearEvents();
\`\`\`

Key behaviors:
- \`addEvent(event)\` is protected — only the aggregate itself can record events.
- \`getEvents()\` returns all uncommitted domain events.
- \`clearEvents()\` is called after events have been dispatched/persisted.

## DomainEvent

Abstract base class for domain events. All fields are runtime-immutable.

\`\`\`ts
import { DomainEvent } from '@beebear-plugins/ddd';

export class OrderSubmitted extends DomainEvent {
  readonly eventName = 'OrderSubmitted';

  constructor(aggregateId: string) {
    super(aggregateId);
  }
}

const event = new OrderSubmitted('order-1');
event.eventName;   // 'OrderSubmitted'
event.aggregateId; // 'order-1'
event.occurredAt;  // Date (auto-set at construction)
\`\`\`

Key behaviors:
- \`eventName\` — abstract, must be defined by subclass.
- \`aggregateId\` — the id of the aggregate that raised the event.
- \`occurredAt\` — timestamp, defaults to \`new Date()\`. Accepts \`Date\`, \`string\`, or \`number\`.
- Optional \`timestampFactory\` parameter in constructor for deterministic testing.
- All fields are made runtime-immutable after construction.

## Using with beebear

The DDD plugin is standalone but integrates naturally with beebear's architecture:

\`\`\`ts
// domain/models/order.ts — uses @beebear-plugins/ddd
import { AggregateRoot } from '@beebear-plugins/ddd';

export class Order extends AggregateRoot<string> {
  /* ... */
}

// domain/use-cases/submit-order.use-case.ts — uses beebear
import type { UseCase } from 'beebear';
import { NotFoundError } from 'beebear';
import type { OrderRepository }
  from '../ports/outbound/order-repository.port';

export class SubmitOrderUseCase
  implements UseCase<{ orderId: string }, void> {
  constructor(
    private readonly orderRepo: OrderRepository
  ) {}

  async execute(input: { orderId: string }): Promise<void> {
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) throw new NotFoundError('Order not found');
    order.submit();
    await this.orderRepo.save(order);
    // Dispatch order.getEvents() via event bus,
    // then order.clearEvents()
  }
}
\`\`\`
`;

DOCS.mcp = `# @beebear-plugins/mcp

MCP (Model Context Protocol) server that teaches AI coding assistants how to use
beebear — the hexagonal architecture framework for Node.js/TypeScript.

## What It Does

AI assistants don't know beebear. They'll generate decorator-heavy code, skip
\`Port<T>()\` tokens, put logic in adapters, and miss error mapping. This MCP server
fixes that by providing:

- **8 Resources** — Documentation on beebear's API, patterns, project structure,
  errors, HTTP adapters, decorators plugin, and DDD plugin
- **10 Tools** — Code scaffold generators for ports, use cases, adapters, routes,
  container setup, DDD building blocks, and decorator setup
- **2 Prompts** — Guided workflows for creating new projects and adding features

## Usage

### With Claude Code

\`\`\`bash
claude mcp add beebear-mcp -- npx -y @beebear-plugins/mcp
\`\`\`

### With Claude Desktop

Add to your \`claude_desktop_config.json\`:

\`\`\`json
{
  "mcpServers": {
    "beebear": {
      "command": "npx",
      "args": ["-y", "@beebear-plugins/mcp"]
    }
  }
}
\`\`\`

### With any MCP client

\`\`\`bash
npx -y @beebear-plugins/mcp
\`\`\`

## Resources

| Resource | URI | Content |
|---|---|---|
| overview | \`beebear://docs/overview\` | What beebear is, core concepts, plugin ecosystem |
| api | \`beebear://docs/api\` | Full API reference with type signatures |
| patterns | \`beebear://docs/patterns\` | Port definition, use cases, adapters, container binding, HTTP routes, hooks |
| project-structure | \`beebear://docs/project-structure\` | Standard folder layout and what goes where |
| errors | \`beebear://docs/errors\` | Error hierarchy, HTTP status mapping, custom errors |
| http-adapters | \`beebear://docs/http-adapters\` | Express/Fastify/Hono examples, custom strategies |
| decorators | \`beebear://docs/decorators\` | @Injectable, @Inject, withDecorators |
| ddd | \`beebear://docs/ddd\` | ValueObject, Entity, AggregateRoot, DomainEvent |

## Tools

| Tool | Description |
|---|---|
| \`scaffold_port\` | Generate inbound (UseCase) or outbound (dependency) port |
| \`scaffold_use_case\` | Generate use case class implementing a driving port |
| \`scaffold_adapter\` | Generate adapter class implementing an outbound port |
| \`scaffold_route\` | Generate HTTP route with \`hex.httpAdapter()\` |
| \`scaffold_container_setup\` | Generate container bindings with \`createContainer()\` |
| \`scaffold_entity\` | Generate DDD Entity subclass |
| \`scaffold_value_object\` | Generate DDD ValueObject with validation |
| \`scaffold_aggregate\` | Generate AggregateRoot with domain events |
| \`scaffold_event_publisher\` | Generate EventPublisher port + transport adapter |
| \`scaffold_decorator_setup\` | Generate @Injectable/@Inject decorator setup |

## Prompts

| Prompt | Args | Description |
|---|---|---|
| \`new-project\` | \`framework\` (express/fastify/hono), \`name\` | Step-by-step new project setup |
| \`add-feature\` | \`featureName\`, \`description\` | Add a feature with ports, use case, adapter, route, tests |
`;


/* ── Markdown-to-HTML Renderer ─────────────────────────────── */

function renderMarkdown(md) {
  // Normalize line endings
  md = md.replace(/\r\n/g, '\n');

  // Extract code blocks first to protect them
  const codeBlocks = [];
  md = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    // Unescape the escaped template literals from JS strings
    code = code.replace(/\\\$/g, '$');
    codeBlocks.push({ lang: lang || '', code: code.trimEnd() });
    return `\n%%CODEBLOCK_${idx}%%\n`;
  });

  const lines = md.split('\n');
  let html = '';
  let inList = false;
  let inTable = false;
  let tableRows = [];

  function flushTable() {
    if (!inTable) return;
    inTable = false;
    if (tableRows.length < 2) return;

    const headers = parseTableRow(tableRows[0]);
    // Skip separator row (index 1)
    const body = tableRows.slice(2).map(parseTableRow);

    let t = '<table><thead><tr>';
    headers.forEach(h => { t += `<th>${inlineFormat(h.trim())}</th>`; });
    t += '</tr></thead><tbody>';
    body.forEach(row => {
      t += '<tr>';
      row.forEach(cell => { t += `<td>${inlineFormat(cell.trim())}</td>`; });
      t += '</tr>';
    });
    t += '</tbody></table>';
    html += t;
    tableRows = [];
  }

  function parseTableRow(row) {
    return row.replace(/^\|/, '').replace(/\|$/, '').split('|');
  }

  function flushList() {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block placeholder
    const cbMatch = line.match(/^%%CODEBLOCK_(\d+)%%$/);
    if (cbMatch) {
      flushList();
      flushTable();
      const cb = codeBlocks[parseInt(cbMatch[1])];
      const escaped = escapeHtml(cb.code);
      const langClass = cb.lang ? ` class="language-${cb.lang}"` : '';
      const isTree = !cb.lang && (escaped.includes('├') || escaped.includes('└'));
      const preClass = isTree ? ' class="tree"' : '';
      const dataLang = cb.lang ? ` data-lang="${cb.lang}"` : '';
      html += `<pre${preClass}${dataLang}><code${langClass}>${escaped}</code></pre>`;
      continue;
    }

    // Table row
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushList();
      inTable = true;
      tableRows.push(line.trim());
      continue;
    } else {
      flushTable();
    }

    // Headings
    const h1 = line.match(/^# (.+)/);
    if (h1) { flushList(); html += `<h1>${inlineFormat(h1[1])}</h1>`; continue; }
    const h2 = line.match(/^## (.+)/);
    if (h2) { flushList(); const hid = h2[1].replace(/[`*_]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); html += `<h2 id="${hid}">${inlineFormat(h2[1])}</h2>`; continue; }
    const h3 = line.match(/^### (.+)/);
    if (h3) { flushList(); html += `<h3>${inlineFormat(h3[1])}</h3>`; continue; }
    const h4 = line.match(/^#### (.+)/);
    if (h4) { flushList(); html += `<h4>${inlineFormat(h4[1])}</h4>`; continue; }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { flushList(); html += '<hr>'; continue; }

    // List items
    const li = line.match(/^[-*] (.+)/);
    if (li) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inlineFormat(li[1])}</li>`;
      continue;
    }

    // Numbered list
    const oli = line.match(/^\d+\. (.+)/);
    if (oli) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inlineFormat(oli[1])}</li>`;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      flushList();
      continue;
    }

    // Paragraph — collect consecutive non-empty lines
    flushList();
    let para = line;
    while (i + 1 < lines.length
           && lines[i + 1].trim() !== ''
           && !lines[i + 1].match(/^#{1,4} /)
           && !lines[i + 1].match(/^[-*] /)
           && !lines[i + 1].match(/^\d+\. /)
           && !lines[i + 1].match(/^%%CODEBLOCK_/)
           && !lines[i + 1].trim().startsWith('|')
           && !lines[i + 1].match(/^---+$/)) {
      i++;
      para += ' ' + lines[i];
    }
    html += `<p>${inlineFormat(para)}</p>`;
  }

  flushList();
  flushTable();
  return html;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineFormat(text) {
  // Bold + italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  // Em dash
  text = text.replace(/ — /g, ' &mdash; ');
  return text;
}


/* ── App Init ──────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  const content = document.getElementById('doc-content');
  const sidebarNav = document.getElementById('sidebar-nav');
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.getElementById('mobile-toggle');
  const overlay = document.getElementById('sidebar-overlay');

  // ── Theme toggle ───────────────────────────────────────────
  const themeToggle = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });

  // Extract h2 headings from markdown
  function getHeadings(md) {
    const headings = [];
    const lines = md.split('\n');
    for (const line of lines) {
      const m = line.match(/^## (.+)/);
      if (m) {
        const text = m[1].replace(/[`*_]/g, '');
        const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        headings.push({ text, id });
      }
    }
    return headings;
  }

  // Build sidebar nav
  const NAV = [
    { label: 'Core', items: [
      { key: 'overview', title: 'Overview' },
      { key: 'api', title: 'API Reference' },
      { key: 'patterns', title: 'Patterns' },
      { key: 'project-structure', title: 'Project Structure' },
      { key: 'errors', title: 'Error Handling' },
      { key: 'http-adapters', title: 'HTTP Adapters' },
    ]},
    { label: 'Plugins', items: [
      { key: 'decorators', title: 'DI Decorators' },
      { key: 'ddd', title: 'DDD' },
      { key: 'mcp', title: 'MCP Server' },
    ]},
  ];

  NAV.forEach(group => {
    const div = document.createElement('div');
    div.className = 'nav-group';
    div.innerHTML = `<span class="nav-group-label">${group.label}</span>`;

    group.items.forEach(item => {
      const wrapper = document.createElement('div');
      wrapper.className = 'nav-item';

      const link = document.createElement('a');
      link.href = '#' + item.key;
      link.className = 'nav-link';
      link.dataset.doc = item.key;
      link.textContent = item.title;
      wrapper.appendChild(link);

      link.addEventListener('click', (e) => {
        e.preventDefault();
        loadDoc(item.key);
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
      });

      div.appendChild(wrapper);
    });

    sidebarNav.appendChild(div);
  });

  const tocBar = document.getElementById('toc-bar');

  function setActive(key) {
    document.querySelectorAll('.nav-item').forEach(item => {
      const link = item.querySelector('.nav-link');
      if (link.dataset.doc === key) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  function populateToc(key) {
    const headings = getHeadings(DOCS[key] || '');
    if (!headings.length) {
      tocBar.classList.remove('visible');
      tocBar.innerHTML = '';
      return;
    }
    tocBar.innerHTML = '<div class="toc-title">On this page</div>';
    headings.forEach(h => {
      const a = document.createElement('a');
      a.className = 'toc-link';
      a.href = '#' + h.id;
      a.textContent = h.text;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        tocBar.querySelectorAll('.toc-link').forEach(l => l.classList.remove('active'));
        a.classList.add('active');
        const el = document.getElementById(h.id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      tocBar.appendChild(a);
    });
    tocBar.classList.add('visible');
  }

  function clearToc() {
    tocBar.classList.remove('visible');
    tocBar.innerHTML = '';
  }

  // Background logo element (lives outside the card)
  const bgLogo = document.createElement('div');
  bgLogo.className = 'home-logo';
  bgLogo.innerHTML = '<img src="logo.png" alt="">';
  document.body.appendChild(bgLogo);

  const homeHTML = `
    <div class="home-screen">
      <p class="home-tagline">Lightweight hexagonal architecture framework<br>for Node.js with TypeScript</p>
      <div class="home-packages">
        <a class="home-cta home-cta-primary" href="https://www.npmjs.com/package/beebear" target="_blank">
          <span class="home-cta-icon">&#9655;</span> npm i beebear
        </a>
        <div class="home-plugins">
          <a class="home-cta home-cta-sm" href="https://www.npmjs.com/package/@beebear-plugins/di-decorators" target="_blank">@beebear-plugins/di-decorators</a>
          <a class="home-cta home-cta-sm" href="https://www.npmjs.com/package/@beebear-plugins/ddd" target="_blank">@beebear-plugins/ddd</a>
          <a class="home-cta home-cta-sm" href="https://www.npmjs.com/package/@beebear-plugins/mcp" target="_blank">@beebear-plugins/mcp</a>
        </div>
      </div>
    </div>
  `;

  function showHome(animate) {
    setActive('');
    if (animate && !content.classList.contains('home')) {
      content.classList.add('fade-out');
      clearToc();
      setTimeout(() => {
        content.classList.remove('fade-out', 'fade-in');
        content.classList.add('home');
        bgLogo.classList.add('visible');
        content.innerHTML = homeHTML;
        history.replaceState(null, '', window.location.pathname);
      }, 500);
    } else {
      clearToc();
      content.classList.add('home');
      bgLogo.classList.add('visible');
      content.innerHTML = homeHTML;
      history.replaceState(null, '', window.location.pathname);
    }
  }

  function loadDoc(key) {
    const md = DOCS[key];
    if (!md) return;
    // Fade out current content first
    content.classList.add('fade-out');
    setTimeout(() => {
      content.classList.remove('home', 'fade-out');
      content.classList.add('fade-in');
      bgLogo.classList.remove('visible');
      content.innerHTML = renderMarkdown(md);
      content.querySelectorAll('pre code[class*="language-"]').forEach(el => {
        Prism.highlightElement(el);
      });
      setActive(key);
      populateToc(key);
      history.replaceState(null, '', '#' + key);
      window.scrollTo({ top: 0 });
      // Trigger fade in
      requestAnimationFrame(() => {
        content.classList.remove('fade-in');
      });
    }, 250);
  }

  // Logo click → home
  document.querySelector('.sidebar-logo').addEventListener('click', () => {
    showHome(true);
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  });

  // Mobile toggle
  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
  });

  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  });

  // If URL has a hash, load that doc; otherwise show home
  const hash = location.hash.replace('#', '');
  if (hash && DOCS[hash]) {
    loadDoc(hash);
  } else {
    showHome();
  }
});
