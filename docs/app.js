/* ── Documentation Content ─────────────────────────────────── */

const DOCS = {};

DOCS.overview = `# beebear — Hexagonal Architecture Framework

## What is beebear?

beebear is a lightweight, **decorator-free** framework for hexagonal architecture
(ports and adapters) in Node.js/TypeScript. It has **zero runtime dependencies**.
You focus on domain logic and adapter implementations; beebear gives you the
building blocks — a DI container, error classes with HTTP status mapping,
and HTTP adapter support for Express, Fastify, and Hono.

## Core Concepts

### Hexagonal Architecture
Your application is split into an inner hexagon (domain logic) and outer adapters
(infrastructure). The domain defines **ports** (interfaces) that adapters implement.
Dependencies always point inward — the domain never imports infrastructure code.

### Ports
Ports are TypeScript interfaces paired with a runtime token via \`Port<T>(name)\`.
Ports live inside the domain. There are two kinds:
- **Inbound (driving) ports** — use case interfaces that the outside world calls
- **Outbound (driven) ports** — repository/service interfaces the domain needs

### Adapters
Adapters live in infrastructure and implement port interfaces:
- **Driving adapters** — HTTP controllers, CLI handlers, message consumers
- **Driven adapters** — database repositories, email services, payment gateways

### Use Cases
Class-based by default. A use case implements a driving port and depends on driven ports.
Use cases live inside the hexagon and have zero framework imports.

### DI Container
Token-based, no decorators, no \`reflect-metadata\`. You register dependencies
explicitly. Singleton by default with transient and scoped opt-in. Call
\`container.validate()\` at startup to catch missing bindings early.

## What beebear Gives You vs What You Bring

**beebear gives you:**
- \`Port<T>()\` / \`Token<T>()\` — typed DI tokens
- \`createContainer()\` — DI container with bind/resolve/validate
- \`createHexApp()\` — wires container, error mapping, HTTP adapters, and hooks
- Error base classes with built-in HTTP status mapping
- \`httpAdapter()\` — connects use cases to Express, Fastify, or Hono routes
- Lifecycle hooks: \`beforeExecute\`, \`afterExecute\`, \`onError\`

**You bring:**
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
type InjectionToken<T> = symbol & { __type?: T };

function Token<T>(name: string): InjectionToken<T>;
function Port<T>(name: string): InjectionToken<T>;
\`\`\`

- \`Token<T>(name)\` creates a unique token for DI. Throws if \`name\` is already used.
- \`Port<T>(name)\` is an alias for \`Token\`. Use \`Port\` for hexagonal ports, \`Token\` for general dependencies.
- The type parameter \`T\` keeps resolution type-safe — \`container.resolve(token)\` returns \`T\`.

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

- \`bind(token, factory)\` — you provide a function that returns the instance.
- \`bind(token, Constructor, [depTokens])\` — shorthand: you list the dependency tokens, beebear passes them to the constructor.
- \`resolve(token)\` — returns the instance. Singleton by default (cached after first call).
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

Ports are TypeScript interfaces paired with runtime tokens. Inbound ports define
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
a \`Port<T>()\` token defined alongside the interface.

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

\`createHexApp\` includes these defaults:

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

Custom subclasses inherit the parent's HTTP status. An \`OrderAlreadyShippedError\`
maps to 409 because it extends \`ConflictError\`.

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

The map key is the error class name. Subclass mappings take priority over parent mappings.

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

beebear supports Express, Fastify, and Hono out of the box. You pick your framework
once at startup, and beebear gives you route handlers that work with it.

## Framework Selection

\`\`\`ts
import { createHexApp } from 'beebear';

// Explicit selection (recommended)
const hex = createHexApp({ container, framework: 'express' });
const hex = createHexApp({ container, framework: 'fastify' });
const hex = createHexApp({ container, framework: 'hono' });

// Auto-detection: beebear finds which framework is installed
const hex = createHexApp({ container });
\`\`\`

## httpAdapter Usage

\`httpAdapter\` returns a route handler for your framework. You provide a \`toInput\`
function that extracts the use case input from the request — beebear runs the use
case and sends the response.

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

## Custom Framework Support

For frameworks other than Express/Fastify/Hono, pass a custom handler object:

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

Structural/payload validation (Zod, Joi, etc.) happens in your middleware **before**
\`httpAdapter\`:

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

Class decorator. Marks the class so it gets wired up when you call \`withDecorators()\`.

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

Applies all \`@Injectable\` classes to the container and returns a \`DecoratorContainer\`.

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

Base class for immutable objects identified by their properties (no unique ID).
Two value objects with the same properties are considered equal.

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
- \`props\` are immutable after construction — cannot be changed.
- \`validate(props)\` is called during construction. Override to add rules.
- \`equals(other)\` compares all props by value.

## Entity<TId>

Base class for objects with a unique identity. Two entities with the same \`id\`
are considered equal, regardless of other properties. \`TId\` is \`string\` or \`number\`.

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
- \`id\` is immutable once set via \`super(id)\`.
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
- \`addEvent(event)\` can only be called from within the aggregate.
- \`getEvents()\` returns all uncommitted domain events.
- \`clearEvents()\` is called after events have been dispatched/persisted.

## DomainEvent

Base class for domain events. All fields are immutable.

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
- \`eventName\` — you define this in your subclass.
- \`aggregateId\` — the id of the aggregate that raised the event.
- \`occurredAt\` — timestamp, set automatically at construction.
- All fields are immutable after construction.

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

DOCS.skills = `# Claude Code Skills for beebear

Ready-to-use skill files for AI coding assistants. Copy these into your
project and your assistant will generate correct beebear code out of the box.

## Setup

\`\`\`
.claude/skills/
├── beebear/SKILL.md          # conventions, structure, rules
├── beebear-scaffold/SKILL.md # code generation for all constructs
└── beebear-ddd/SKILL.md      # only if using @beebear-plugins/ddd
\`\`\`

Create the folders, paste the content below into each \`SKILL.md\`, done.

---

## 1. beebear — Project Conventions

This is the most important one. It teaches your AI assistant the architecture
rules, file layout, and how all the pieces connect.

\`\`\`markdown
---
name: beebear
description: beebear hexagonal architecture conventions — project structure, dependency direction, coding patterns, and what NOT to do
---

# beebear Project Conventions

This project uses beebear — a decorator-free hexagonal architecture framework
for Node.js/TypeScript with zero runtime dependencies.

## Project Structure

src/
  domain/
    models/          — plain TS classes, no framework imports
    ports/
      inbound/       — use case interfaces + Port<T>() tokens
      outbound/      — repository/service interfaces + Port<T>() tokens
    use-cases/       — use case classes implementing inbound ports
    errors/          — custom error subclasses (extend beebear errors)
  infrastructure/
    persistence/     — DB adapters implementing outbound ports
    http/            — route files using hex.httpAdapter()
    services/        — external service adapters (email, payment, etc.)

## Dependency Rule

domain/ NEVER imports from infrastructure/. Ever. Dependencies point inward.
Ports are owned by the domain. Infrastructure implements them.

## Port Pattern

Every port is a TypeScript interface paired with a runtime token:

  import { Port } from 'beebear';
  export interface UserRepository { ... }
  export const UserRepository = Port<UserRepository>('UserRepository');

The type and const share the same name. This is intentional (declaration merging).
Inbound ports extend UseCase<TInput, TOutput>. Outbound ports are plain interfaces.
One port per file. Token name must be unique across the app.

## Use Case Pattern

Use cases implement inbound ports, receive outbound ports via constructor:

  export class RegisterUserUseCase implements RegisterUserPort {
    constructor(private readonly userRepo: UserRepository) {}
    async execute(input: RegisterUserInput): Promise<RegisterUserOutput> { ... }
  }

No framework imports in use cases. Only beebear error classes and port types.
Throw NotFoundError, ConflictError, ValidationError for domain rule violations.

## Container Wiring

All wiring happens at the entry point (main.ts or container.ts):

  const container = createContainer();
  container.bind(UserRepository, () => new PrismaUserRepository(prisma));
  container.bind(RegisterUserPort, (c) => new RegisterUserUseCase(c.resolve(UserRepository)));
  container.validate();  // catches missing bindings at startup

Singleton by default. Transient and scoped are opt-in via { lifecycle: 'transient' }.

## HTTP Routes

  const hex = createHexApp({ container, framework: 'express' });
  app.post('/users', hex.httpAdapter(RegisterUserPort, {
    toInput: (req) => ({ email: req.body.email, name: req.body.name }),
  }));

toInput is always required. POST defaults to 201, DELETE to 204, others to 200.
Validation middleware (Zod, Joi) runs BEFORE httpAdapter.

## Error Handling

beebear errors map to HTTP status codes:
  BusinessError=400, ValidationError=400, NotFoundError=404,
  ConflictError=409, UnauthorizedError=401, ForbiddenError=403.

Custom errors extend a parent: class OrderShippedError extends ConflictError { }
They inherit the parent's status code. Unknown errors become 500.

## DO NOT

- Do NOT use decorators or reflect-metadata (beebear is decorator-free)
- Do NOT import infrastructure code inside domain/
- Do NOT put business logic in adapters or route files
- Do NOT skip container.validate() at startup
- Do NOT use abstract classes for ports — use plain interfaces + Port<T>()
- Do NOT auto-wire dependencies — all bindings are explicit
\`\`\`

---

## 2. beebear-scaffold — Code Generation

This one lets your assistant generate any beebear construct on command.

\`\`\`markdown
---
name: beebear-scaffold
description: Generate beebear code — ports, use cases, adapters, routes, container bindings, and custom errors
---

# beebear Code Scaffolding

When asked to create beebear constructs, follow these exact patterns.

## Inbound Port (use case interface)

File: src/domain/ports/inbound/<kebab-name>.port.ts

  import { Port } from 'beebear';
  import type { UseCase } from 'beebear';

  export interface <Name>Input {
    // fields
  }

  export interface <Name>Output {
    // fields
  }

  export type <Name>Port = UseCase<<Name>Input, <Name>Output>;
  export const <Name>Port = Port<<Name>Port>('<Name>');

## Outbound Port (repository or service interface)

File: src/domain/ports/outbound/<kebab-name>.port.ts

  import { Port } from 'beebear';

  export interface <Name> {
    // methods — use Promise return types for async
  }

  export const <Name> = Port<<Name>>('<Name>');

## Use Case

File: src/domain/use-cases/<kebab-name>.use-case.ts

  import type { <Port>, <Input>, <Output> } from '../ports/inbound/<port>.port';
  import type { <OutboundPort> } from '../ports/outbound/<dep>.port';
  import { NotFoundError, ConflictError, ValidationError } from 'beebear';

  export class <Name>UseCase implements <Port> {
    constructor(
      private readonly <dep>: <OutboundPort>,
    ) {}

    async execute(input: <Input>): Promise<<Output>> {
      // business logic here
      // throw beebear errors for domain violations
    }
  }

## Driven Adapter

File: src/infrastructure/persistence/<kebab-name>.ts (or services/)

  import type { <Port> } from '../../domain/ports/outbound/<port>.port';

  export class <Name> implements <Port> {
    // implement every method from the port interface
    // can import any third-party library
  }

## HTTP Route

  app.<method>('<path>', hex.httpAdapter(<Token>, {
    toInput: (req) => ({
      // map req.body, req.params, req.query to use case input
    }),
  }));

  // Status defaults: POST=201, DELETE=204, others=200
  // Override: { toInput: ..., status: 200 }

## Container Binding

  // Factory form
  container.bind(<Token>, () => new <Impl>());

  // Factory with dependencies
  container.bind(<Token>, (c) => new <Impl>(c.resolve(<Dep>)));

  // Constructor shorthand
  container.bind(<Token>, <Impl>, [<Dep1>, <Dep2>]);

  // Lifecycle
  container.bind(<Token>, () => new <Impl>(), { lifecycle: 'transient' });

## Custom Error

File: src/domain/errors/<kebab-name>.error.ts

  import { <ParentError> } from 'beebear';

  export class <Name> extends <ParentError> {
    constructor(/* context */) {
      super('message', 'UPPER_SNAKE_CODE');
    }
  }

  // Parents: BusinessError(400), ValidationError(400), NotFoundError(404),
  // ConflictError(409), UnauthorizedError(401), ForbiddenError(403)

## Naming Conventions

- Files: kebab-case with suffix (.port.ts, .use-case.ts, .error.ts)
- Classes/Interfaces: PascalCase
- Ports: same name for type and const (declaration merging)
- One construct per file
\`\`\`

---

## 3. beebear-ddd — DDD Building Blocks

Only needed if you use the \`@beebear-plugins/ddd\` package.

\`\`\`markdown
---
name: beebear-ddd
description: Generate DDD building blocks using @beebear-plugins/ddd — ValueObject, Entity, AggregateRoot, and DomainEvent
---

# beebear DDD Scaffolding

This project uses @beebear-plugins/ddd for Domain-Driven Design building blocks.

## ValueObject

Immutable. Compared by properties. Override validate() to enforce rules.

File: src/domain/models/<kebab-name>.ts

  import { ValueObject } from '@beebear-plugins/ddd';

  interface <Name>Props {
    // properties
  }

  export class <Name> extends ValueObject<<Name>Props> {
    protected validate(props: <Name>Props): void {
      // throw Error if props are invalid
    }

    get <prop>(): <type> { return this.props.<prop>; }

    // value objects are immutable — methods return new instances
    // e.g. add(other: Money): Money { return new Money({ ... }); }
  }

## Entity

Has a unique ID. Compared by ID only, not by properties.

File: src/domain/models/<kebab-name>.ts

  import { Entity } from '@beebear-plugins/ddd';

  export class <Name> extends Entity<string> {
    constructor(
      id: string,
      // other fields as private members
    ) {
      super(id);
    }

    // id is immutable after construction
    // entities CAN have mutable state (unlike value objects)
  }

## AggregateRoot + DomainEvent

An aggregate root is an Entity that records domain events.

File: src/domain/models/<kebab-name>.ts

  import { AggregateRoot, DomainEvent } from '@beebear-plugins/ddd';

  export class <EventName> extends DomainEvent {
    readonly eventName = '<EventName>';
    constructor(aggregateId: string /*, extra fields */) {
      super(aggregateId);
    }
  }

  export class <Name> extends AggregateRoot<string> {
    doSomething(): void {
      // enforce invariants, then record event
      this.addEvent(new <EventName>(this.id));
    }
  }

  // After persisting: aggregate.getEvents() to dispatch, then clearEvents()

## Rules

- ValueObject: props are frozen after construction, equals() compares all props
- Entity: id is immutable, equals() compares id only
- AggregateRoot: addEvent() only callable from inside the aggregate
- DomainEvent: eventName + aggregateId + occurredAt are all immutable
- Domain models go in domain/models/, never in infrastructure/
- @beebear-plugins/ddd is standalone — works with or without core beebear
\`\`\`
`;

DOCS.mcp = `# @beebear-plugins/mcp

**An experimental take on MCP.** Most MCP servers connect AI assistants to external
services — databases, APIs, file systems. This one is different: it doesn't connect
to anything. Instead, it teaches an AI assistant *how to write code* in a specific
style. It's MCP as a knowledge layer, not an integration layer.

We built this to explore a question: can you use MCP to make an AI assistant
genuinely understand a framework's conventions, patterns, and opinions — not
just its API surface?

## What's Different Here

Typical MCP tools perform actions — query a database, call an API, read a file.
Our tools generate code. When an AI assistant calls \`scaffold_port\` or
\`scaffold_use_case\`, it doesn't hit any external service. It returns a code
snippet that follows beebear's conventions — correct imports, correct structure,
correct patterns. The AI assistant then uses that scaffold as a starting point.

This turns MCP tools into opinionated code generators rather than service
connectors. The assistant doesn't just *know* beebear's patterns — it can
*produce* them on demand.

## What It Does

AI assistants don't know beebear. They'll generate decorator-heavy code, skip
\`Port<T>()\` tokens, put logic in adapters, and miss error mapping. This MCP server
gives them beebear knowledge via:

- **8 Resources** — Documentation on beebear's API, patterns, project structure,
  errors, HTTP adapters, decorators plugin, and DDD plugin
- **10 Tools** — Code scaffold generators that return correctly structured
  beebear code for ports, use cases, adapters, routes, container setup, and more
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
      html += `<div class="code-block"><pre${preClass}${dataLang}><code${langClass}>${escaped}</code></pre><button class="copy-btn" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>`;
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
    { label: 'AI Assistant', items: [
      { key: 'skills', title: 'Skills', subtitle: 'copy & use' },
      { key: 'mcp', title: 'MCP Server', subtitle: 'experimental' },
    ]},
    { label: 'Plugins', items: [
      { key: 'ddd', title: 'DDD' },
      { key: 'decorators', title: 'DI Decorators' },
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
      if (item.subtitle) {
        const sub = document.createElement('span');
        sub.className = 'nav-link-subtitle';
        sub.textContent = item.subtitle;
        link.appendChild(sub);
      }
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

  let tocObserver = null;

  function populateToc(key) {
    // Clean up previous observer
    if (tocObserver) { tocObserver.disconnect(); tocObserver = null; }

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
      a.dataset.headingId = h.id;
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

    // Observe headings for scroll-based active state
    tocObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          tocBar.querySelectorAll('.toc-link').forEach(l => l.classList.remove('active'));
          const match = tocBar.querySelector(`.toc-link[data-heading-id="${entry.target.id}"]`);
          if (match) match.classList.add('active');
        }
      });
    }, { rootMargin: '0px 0px -70% 0px', threshold: 0 });

    headings.forEach(h => {
      const el = document.getElementById(h.id);
      if (el) tocObserver.observe(el);
    });
  }

  function clearToc() {
    if (tocObserver) { tocObserver.disconnect(); tocObserver = null; }
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
      content.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.closest('.code-block').querySelector('code');
          navigator.clipboard.writeText(code.textContent);
          btn.classList.add('copied');
          setTimeout(() => btn.classList.remove('copied'), 1500);
        });
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
