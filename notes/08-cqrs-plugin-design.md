# CQRS Plugin Design (`@beebear/cqrs`)

> CQRS (Command Query Responsibility Segregation) is an **optional plugin**,
> not part of core beebear. Core ships `UseCase<TInput, TOutput>` which handles
> both reads and writes. This plugin splits that into two explicit paths.

---

## 1. What CQRS Actually Is

One sentence: **use a different model to update information than the model you
use to read information.**

In practice, this means:
- **Commands** = write operations (create, update, delete). They change state.
- **Queries** = read operations. They return data. They do NOT change state.

Without CQRS, a single `UseCase` handles both:

```ts
// This is a command (changes state)
class PlaceOrderUseCase implements UseCase<PlaceOrderInput, OrderId> { ... }

// This is a query (reads state)
class GetUserOrdersUseCase implements UseCase<{ userId: string }, Order[]> { ... }
```

They look the same. Nothing enforces that `GetUserOrdersUseCase` doesn't
accidentally mutate data. Nothing distinguishes them at the infrastructure level.

With CQRS, the distinction is explicit and enforced:

```ts
class PlaceOrderHandler implements CommandHandler<PlaceOrderCommand, OrderId> { ... }
class GetUserOrdersHandler implements QueryHandler<GetUserOrdersQuery, Order[]> { ... }
```

---

## 2. The Contracts

### CommandHandler

```ts
// A command changes state. It MAY return a result (often an ID or void).
interface CommandHandler<TCommand, TResult = void> {
  execute(command: TCommand): Promise<TResult>;
}
```

### QueryHandler

```ts
// A query reads state. It MUST NOT change state (side-effect-free).
interface QueryHandler<TQuery, TResult> {
  execute(query: TQuery): Promise<TResult>;
}
```

These replace `UseCase<TInput, TOutput>` when CQRS is used. They're
structurally identical but semantically different — and that semantic
difference is what enables everything below.

---

## 3. Typed Tokens

Just like `Port<T>()` creates tokens for ports, CQRS needs tokens for
commands and queries:

```ts
import { Command, Query } from '@beebear/cqrs';

// Command token
interface PlaceOrderCommand {
  userId: string;
  items: Array<{ productId: string; quantity: number }>;
}
const PlaceOrderCommand = Command<PlaceOrderCommand, OrderId>('PlaceOrderCommand');

// Query token
interface GetUserOrdersQuery {
  userId: string;
  page?: number;
}
const GetUserOrdersQuery = Query<GetUserOrdersQuery, Order[]>('GetUserOrdersQuery');
```

Same declaration merging pattern as `Port<T>()`. The token carries both the
input type and the result type.

---

## 4. Command Bus and Query Bus

The buses dispatch to the right handler, resolved from beebear's DI container.

### CommandBus

```ts
interface CommandBus {
  dispatch<TCommand, TResult>(
    token: CommandToken<TCommand, TResult>,
    command: TCommand,
  ): Promise<TResult>;
}
```

### QueryBus

```ts
interface QueryBus {
  dispatch<TQuery, TResult>(
    token: QueryToken<TQuery, TResult>,
    query: TQuery,
  ): Promise<TResult>;
}
```

### Usage

```ts
const hex = createHexApp({
  container,
  errorMap: { ... },
  // CQRS plugin hooks into the app
  plugins: [cqrs()],
});

// In a controller or route
const orderId = await hex.command(PlaceOrderCommand, {
  userId: 'user-123',
  items: [{ productId: 'prod-abc', quantity: 2 }],
});

const orders = await hex.query(GetUserOrdersQuery, {
  userId: 'user-123',
  page: 1,
});
```

`hex.command()` and `hex.query()` are the CQRS equivalents of `hex.execute()`.
They resolve the handler from the container via the token and call `execute()`.

### With adaptRoute

```ts
// Command route
app.post('/orders', hex.adaptCommand(PlaceOrderCommand, {
  toInput: (req) => ({ userId: req.user.id, items: req.body.items }),
  status: 201,
}));

// Query route
app.get('/users/:id/orders', hex.adaptQuery(GetUserOrdersQuery, {
  toQuery: (req) => ({ userId: req.params.id, page: Number(req.query.page) }),
}));
```

`adaptCommand` and `adaptQuery` are CQRS equivalents of `adaptRoute`. They
work with the same framework strategy pattern internally.

---

## 5. Bus Middleware

Each bus can have its own middleware pipeline. This is where the real power
of separating commands from queries shows up.

### Command Bus Middleware

```ts
const hex = createHexApp({
  container,
  errorMap: { ... },
  plugins: [
    cqrs({
      commandMiddleware: [
        loggingMiddleware(),      // audit log every write operation
        validationMiddleware(),   // validate command payload
        retryMiddleware({ max: 3 }),  // retry on transient failures
      ],
      queryMiddleware: [
        cachingMiddleware({ ttl: 60 }),  // cache query results (safe — queries are side-effect-free)
        rateLimitMiddleware(),            // rate limit reads
      ],
    }),
  ],
});
```

### Middleware Interface

```ts
interface CommandMiddleware {
  execute<TCommand, TResult>(
    command: TCommand,
    next: (command: TCommand) => Promise<TResult>,
  ): Promise<TResult>;
}

interface QueryMiddleware {
  execute<TQuery, TResult>(
    query: TQuery,
    next: (query: TQuery) => Promise<TResult>,
  ): Promise<TResult>;
}
```

### Why Separate Middleware Matters

| Middleware | Commands | Queries |
|-----------|----------|---------|
| Audit logging | Yes — track every mutation | No — reads don't need audit trail |
| Caching | No — writes invalidate caches | Yes — reads are safe to cache |
| Retry | Maybe — idempotent commands only | Yes — reads are always safe to retry |
| Rate limiting | Maybe — depends on business rules | Yes — protect read replicas |
| Validation | Yes — validate before mutating | Maybe — lighter validation |
| Authorization | Yes — who can write? | Yes — who can read? (often different rules) |

With plain `UseCase`, you'd need to manually check "is this a read or write?"
in every middleware. With CQRS, it's structural — command middleware only runs
on commands, query middleware only runs on queries.

---

## 6. Separate Read/Write Models

This is the advanced use case. Most teams won't need this initially, but CQRS
makes it possible.

### Same Model (Simple CQRS)

Both commands and queries use the same database and same domain models.
The only difference is the explicit split in handler types and bus middleware.

```
┌──────────────┐       ┌──────────────┐
│ CommandHandler│       │ QueryHandler │
└──────┬───────┘       └──────┬───────┘
       │                      │
       ▼                      ▼
  ┌─────────────────────────────┐
  │       Same Database          │
  │    (same read/write model)   │
  └─────────────────────────────┘
```

This is the common case. You still get the benefits of separate middleware,
explicit intent, and cleaner code organization.

### Separate Models (Full CQRS)

Commands write to a write-optimized store. Events propagate changes to a
read-optimized store. Queries read from the read store.

```
┌──────────────┐                    ┌──────────────┐
│ CommandHandler│                    │ QueryHandler │
└──────┬───────┘                    └──────┬───────┘
       │                                   │
       ▼                                   ▼
  ┌──────────┐    events      ┌──────────────────┐
  │ Write DB  │──────────────▶│ Read DB (denorm.) │
  │ (normalized)│  (projections) │ (optimized for    │
  └──────────┘                │  specific queries) │
                              └──────────────────┘
```

The write side uses normalized domain models (entities, aggregates).
The read side uses denormalized views optimized for specific queries
(e.g., a `UserOrdersSummary` table that's pre-joined).

This requires:
- Domain events (from `@beebear/ddd`)
- A projection system that listens to events and updates read models
- Eventual consistency between write and read sides

**This is where `@beebear/cqrs` + `@beebear/ddd` combine.** Neither plugin
requires the other, but together they enable full CQRS + Event Sourcing.

---

## 7. Binding Handlers to the Container

Handlers are registered like any other port implementation:

```ts
// Register command handler
container.bind(PlaceOrderCommand, (c) => new PlaceOrderHandler(
  c.resolve(OrderRepository),
  c.resolve(PaymentProcessor),
));

// Register query handler
container.bind(GetUserOrdersQuery, (c) => new GetUserOrdersHandler(
  c.resolve(OrderReadRepository),  // could be a different port for read-optimized access
));
```

The container doesn't care whether it's a command handler, query handler, or
plain use case. It's all token-based resolution. The CQRS plugin just adds
the bus layer on top that dispatches through the right middleware pipeline.

---

## 8. Full Example

### Defining Command + Handler

```ts
// domain/commands/PlaceOrder.ts
import { Command } from '@beebear/cqrs';

export interface PlaceOrderCommand {
  userId: string;
  items: Array<{ productId: string; quantity: number }>;
}
export const PlaceOrderCommand = Command<PlaceOrderCommand, { orderId: string }>('PlaceOrderCommand');
```

```ts
// domain/handlers/PlaceOrderHandler.ts
import { CommandHandler } from '@beebear/cqrs';
import { PlaceOrderCommand } from '../commands/PlaceOrder';

export class PlaceOrderHandler implements CommandHandler<PlaceOrderCommand, { orderId: string }> {
  constructor(
    private orders: OrderRepository,
    private products: ProductRepository,
  ) {}

  async execute(command: PlaceOrderCommand): Promise<{ orderId: string }> {
    // Validate products exist, check stock, create order...
    const order = Order.create(command.userId);
    for (const item of command.items) {
      const product = await this.products.findById(item.productId);
      if (!product) throw new NotFoundError(`Product ${item.productId}`);
      order.addItem(item.productId, item.quantity, product.price);
    }
    order.place();
    await this.orders.save(order);
    return { orderId: order.id };
  }
}
```

### Defining Query + Handler

```ts
// domain/queries/GetUserOrders.ts
import { Query } from '@beebear/cqrs';

export interface GetUserOrdersQuery {
  userId: string;
  page?: number;
  limit?: number;
}
export const GetUserOrdersQuery = Query<GetUserOrdersQuery, OrderSummary[]>('GetUserOrdersQuery');
```

```ts
// domain/handlers/GetUserOrdersHandler.ts
import { QueryHandler } from '@beebear/cqrs';
import { GetUserOrdersQuery } from '../queries/GetUserOrders';

export class GetUserOrdersHandler implements QueryHandler<GetUserOrdersQuery, OrderSummary[]> {
  constructor(private orderQueries: OrderQueryRepository) {}

  async execute(query: GetUserOrdersQuery): Promise<OrderSummary[]> {
    return this.orderQueries.findByUserId(
      query.userId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }
}
```

### Wiring and Routes

```ts
// Composition root
container.bind(PlaceOrderCommand, (c) => new PlaceOrderHandler(
  c.resolve(OrderRepository),
  c.resolve(ProductRepository),
));

container.bind(GetUserOrdersQuery, (c) => new GetUserOrdersHandler(
  c.resolve(OrderQueryRepository),
));

const hex = createHexApp({
  container,
  errorMap: { ... },
  plugins: [cqrs()],
});

// Routes
app.post('/orders',
  validate(PlaceOrderSchema),
  authenticate(),
  hex.adaptCommand(PlaceOrderCommand, {
    toInput: (req) => ({ userId: req.user.id, items: req.body.items }),
    status: 201,
  })
);

app.get('/users/:id/orders',
  authenticate(),
  hex.adaptQuery(GetUserOrdersQuery, {
    toQuery: (req) => ({
      userId: req.params.id,
      page: Number(req.query.page),
      limit: Number(req.query.limit),
    }),
  })
);
```

---

## 9. What the Plugin Ships

```
@beebear/cqrs
├── CommandHandler<TCommand, TResult>    — contract (interface)
├── QueryHandler<TQuery, TResult>        — contract (interface)
├── Command<TCommand, TResult>()         — typed token factory (like Port<T>)
├── Query<TQuery, TResult>()             — typed token factory (like Port<T>)
├── CommandBus                           — dispatches commands through middleware
├── QueryBus                             — dispatches queries through middleware
├── CommandMiddleware                    — middleware interface for command pipeline
├── QueryMiddleware                      — middleware interface for query pipeline
├── cqrs()                               — plugin factory for createHexApp
├── hex.command()                        — dispatch a command (like hex.execute)
├── hex.query()                          — dispatch a query (like hex.execute)
├── hex.adaptCommand()                   — adaptRoute for commands
└── hex.adaptQuery()                     — adaptRoute for queries
```

---

## 10. When to Use CQRS vs Plain UseCase

| Factor | Plain UseCase | CQRS Plugin |
|--------|--------------|-------------|
| App complexity | Simple CRUD, few operations | Complex domain, many operations |
| Read/write ratio | Roughly equal | Read-heavy or write-heavy (asymmetric) |
| Performance needs | Same DB handles both | Need read replicas, caching, denormalized views |
| Middleware needs | Same middleware for all operations | Different middleware for reads vs writes |
| Team size | Small, everyone knows what's a read vs write | Large, need explicit contracts |
| Event sourcing | Not needed | Needed or planned |
| Audit requirements | Basic | Full audit trail on all mutations |

**Start without CQRS.** Core beebear's `UseCase` is enough for most apps.
Add `@beebear/cqrs` when the read/write split becomes a real need — not
before. See section 11 for the migration path.

---

## 11. Migrating from Plain UseCase to CQRS

This is the most important section. If migration is painful, nobody adopts the
plugin. It must be incremental — no big bang rewrite.

### Why Migration Is Easy

`CommandHandler<T, R>` and `QueryHandler<T, R>` have the **exact same
`execute()` signature** as `UseCase<T, R>`:

```ts
// Core beebear
interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}

// CQRS plugin
interface CommandHandler<TCommand, TResult> {
  execute(command: TCommand): Promise<TResult>;
}

interface QueryHandler<TQuery, TResult> {
  execute(query: TQuery): Promise<TResult>;
}
```

Structurally identical. Every existing use case already satisfies the command
or query handler contract. The method body doesn't change. The constructor
doesn't change. The dependencies don't change.

### Step-by-Step Migration (Per Handler)

```ts
// BEFORE — plain UseCase
// domain/ports/inbound/PlaceOrder.ts
import { Port } from 'beebear';

export interface PlaceOrderUseCase {
  execute(input: { userId: string; items: Item[] }): Promise<{ orderId: string }>;
}
export const PlaceOrderUseCase = Port<PlaceOrderUseCase>('PlaceOrderUseCase');

// domain/use-cases/PlaceOrderService.ts
export class PlaceOrderService implements PlaceOrderUseCase {
  constructor(private orders: OrderRepository) {}
  async execute(input: { userId: string; items: Item[] }): Promise<{ orderId: string }> {
    // ... business logic (UNCHANGED)
  }
}

// routes
app.post('/orders', hex.adaptRoute(PlaceOrderUseCase, {
  toInput: (req) => ({ userId: req.user.id, items: req.body.items }),
  status: 201,
}));

// container
container.bind(PlaceOrderUseCase, (c) => new PlaceOrderService(c.resolve(OrderRepository)));
```

```ts
// AFTER — CQRS
// domain/commands/PlaceOrder.ts
import { Command } from '@beebear/cqrs';

export interface PlaceOrderCommand {
  userId: string;
  items: Item[];
}
export const PlaceOrderCommand = Command<PlaceOrderCommand, { orderId: string }>('PlaceOrderCommand');

// domain/handlers/PlaceOrderHandler.ts
export class PlaceOrderHandler implements CommandHandler<PlaceOrderCommand, { orderId: string }> {
  constructor(private orders: OrderRepository) {}  // SAME constructor
  async execute(command: PlaceOrderCommand): Promise<{ orderId: string }> {
    // ... SAME business logic, ZERO changes to the body
  }
}

// routes
app.post('/orders', hex.adaptCommand(PlaceOrderCommand, {
  toInput: (req) => ({ userId: req.user.id, items: req.body.items }),
  status: 201,
}));

// container
container.bind(PlaceOrderCommand, (c) => new PlaceOrderHandler(c.resolve(OrderRepository)));
```

What changed:
1. Token: `Port<...>('PlaceOrderUseCase')` → `Command<...>('PlaceOrderCommand')`
2. Implements clause: `implements PlaceOrderUseCase` → `implements CommandHandler<...>`
3. Route: `hex.adaptRoute(...)` → `hex.adaptCommand(...)`
4. Container binding: new token, new class name

What did NOT change:
- The `execute()` method body — zero changes
- Constructor and dependencies — zero changes
- The route's `toInput` function — zero changes
- The `status` code — zero changes

### Incremental: Both Systems Coexist

The critical design requirement: **you never have to migrate everything at once.**

```ts
const hex = createHexApp({
  container,
  errorMap: { ... },
  plugins: [cqrs()],  // enables CQRS alongside existing UseCase support
});

// ---- Migrated to CQRS ----
app.post('/orders', hex.adaptCommand(PlaceOrderCommand, {
  toInput: (req) => ({ userId: req.user.id, items: req.body.items }),
  status: 201,
}));

app.get('/orders', hex.adaptQuery(GetOrdersQuery, {
  toQuery: (req) => ({ page: Number(req.query.page) }),
}));

// ---- Still using plain UseCase (not migrated yet) ----
app.get('/products/:id', hex.adaptRoute(GetProductUseCase, {
  toInput: (req) => ({ id: req.params.id }),
}));

app.post('/users', hex.adaptRoute(RegisterUserUseCase, {
  toInput: (req) => req.body,
  status: 201,
}));
```

`hex.execute()`, `hex.command()`, and `hex.query()` all work in the same app.
`adaptRoute`, `adaptCommand`, and `adaptQuery` all work in the same routes file.
The container resolves UseCase tokens and Command/Query tokens identically.

There is no deadline. Mixed usage works indefinitely. A developer can migrate
one handler per sprint, or only migrate the ones that benefit from CQRS
middleware (e.g., commands that need audit logging, queries that need caching).

### Migration Checklist

For each use case being migrated:

- [ ] Decide: is this a command (write) or query (read)?
- [ ] Create new token: `Command<T, R>()` or `Query<T, R>()`
- [ ] Change `implements UseCase<T, R>` → `implements CommandHandler<T, R>` or `QueryHandler<T, R>`
- [ ] Update container binding to use new token
- [ ] Update route: `adaptRoute` → `adaptCommand` or `adaptQuery`
- [ ] Delete old port definition (the UseCase token)
- [ ] Run tests — behavior is identical, only wiring changed

---

## 12. CQRS Without Event Sourcing vs With

### Without Event Sourcing (common)

- Commands mutate state directly in the database
- Queries read from the same database (or a read replica)
- No event log, no projections
- Still get the benefits: explicit intent, separate middleware, cleaner code

### With Event Sourcing (advanced, pairs with @beebear/ddd)

- Commands produce domain events (via aggregate roots)
- Events are persisted to an event store (append-only log)
- Projections consume events and build read models
- Queries read from projected read models
- Full audit trail, time travel, rebuild-from-events capability

Event sourcing is NOT part of `@beebear/cqrs`. It would be a separate concern
(`@beebear/event-sourcing` or part of `@beebear/ddd`). CQRS just provides the
command/query split that makes event sourcing practical.

---

## 13. Relationship to Other beebear Packages

```
beebear (core)
  └── UseCase, Port<T>, container, adaptRoute, hex.execute()

@beebear/cqrs (this plugin)
  └── CommandHandler, QueryHandler, Command<T>, Query<T>, buses, hex.command(), hex.query()
  └── Depends on: beebear core (container, Port<T> pattern)

@beebear/ddd
  └── Entity, ValueObject, AggregateRoot, DomainEvent
  └── Depends on: beebear core

@beebear/cqrs + @beebear/ddd (combined)
  └── Command handlers work with aggregate roots
  └── Aggregate roots emit domain events
  └── Events can drive projections for read models
  └── Full CQRS + ES pattern
```

Neither plugin requires the other. They're independently useful but
combine naturally for complex domains.
