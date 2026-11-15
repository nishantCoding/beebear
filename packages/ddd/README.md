# @beebear-plugins/ddd

DDD building blocks for TypeScript — Entity, ValueObject, AggregateRoot, DomainEvent. Pure base classes with zero dependencies. Works standalone or with beebear.

## Install

```bash
npm install @beebear-plugins/ddd
```

No peer dependencies. No runtime dependencies.

## Quick Start

```ts
import { ValueObject, Entity, AggregateRoot, DomainEvent } from '@beebear-plugins/ddd';

// Value Object — immutable, structural equality
class Money extends ValueObject<{ amount: number; currency: string }> {
  get amount() { return this.props.amount; }
  get currency() { return this.props.currency; }

  protected validate(props: { amount: number; currency: string }) {
    if (props.amount < 0) throw new Error('Amount cannot be negative');
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) throw new Error('Currency mismatch');
    return new Money({ amount: this.amount + other.amount, currency: this.currency });
  }
}

// Domain Event — immutable, auto-timestamped
class OrderPlaced extends DomainEvent {
  constructor(orderId: string, readonly total: number) {
    super('OrderPlaced', orderId);
  }
}

// Aggregate Root — entity that collects domain events
class Order extends AggregateRoot<string> {
  private items: string[] = [];

  place(total: number): void {
    this.addEvent(new OrderPlaced(this.id, total));
  }
}

const order = new Order('order-1');
order.place(99.99);
order.getEvents(); // [OrderPlaced { eventName: 'OrderPlaced', aggregateId: 'order-1', ... }]
order.clearEvents();
```

## API

### `ValueObject<TProps>`

Abstract base class for immutable objects defined by their properties, not identity.

```ts
class Email extends ValueObject<{ address: string }> {
  get address() { return this.props.address; }

  protected validate(props: { address: string }) {
    if (!props.address.includes('@')) throw new Error('Invalid email');
  }
}

const a = new Email({ address: 'alice@example.com' });
const b = new Email({ address: 'alice@example.com' });
a.equals(b); // true — structural equality
```

- `props` — protected readonly access to the frozen properties
- `validate(props)` — override to enforce invariants (called in constructor, throw on invalid)
- `equals(other)` — structural equality: same class + same property values

### `Entity<TId>`

Abstract base class for objects with unique identity. `TId` is `string | number`.

```ts
class OrderItem extends Entity<string> {
  constructor(id: string, readonly productId: string, readonly quantity: number) {
    super(id);
  }
}

const a = new OrderItem('item-1', 'prod-A', 2);
const b = new OrderItem('item-1', 'prod-B', 5);
a.equals(b); // true — same id, same class
```

- `id` — readonly, set once in constructor, immutable at runtime
- `equals(other)` — identity equality: same class + same `id`

### `AggregateRoot<TId>`

Extends `Entity<TId>`. Entry point for a cluster of related objects. Collects domain events.

```ts
class Cart extends AggregateRoot<string> {
  private items: string[] = [];

  addItem(productId: string): void {
    this.items.push(productId);
    this.addEvent(new ItemAdded(this.id, productId));
  }
}
```

- `addEvent(event)` — protected. Collects a domain event
- `getEvents()` — returns a copy of collected events
- `clearEvents()` — clears the event list (call after persisting/dispatching)

Events are collected, not dispatched. Dispatching is infrastructure's job.

### `DomainEvent`

Abstract base class for domain events emitted by aggregate roots.

```ts
class ItemAdded extends DomainEvent {
  constructor(cartId: string, readonly productId: string) {
    super('ItemAdded', cartId);
  }
}
```

- `eventName` — string identifier, readonly
- `aggregateId` — `string | number`, ID of the emitting aggregate, readonly
- `occurredAt` — `Date | string | number`, auto-set via `new Date()` by default, readonly
- All fields are immutable at runtime (not just compile-time)

#### Custom timestamp factory

Pass an optional factory to control the timestamp format:

```ts
// UTC number
class MyEvent extends DomainEvent {
  constructor(aggregateId: string) {
    super('MyEvent', aggregateId, () => Date.now());
  }
}

// ISO string
class MyEvent extends DomainEvent {
  constructor(aggregateId: string) {
    super('MyEvent', aggregateId, () => new Date().toISOString());
  }
}

// Fixed timestamp (useful for testing/replay)
class MyEvent extends DomainEvent {
  constructor(aggregateId: string) {
    super('MyEvent', aggregateId, () => new Date('2025-01-01T00:00:00Z'));
  }
}
```

## Design Decisions

- **No DI involvement.** DDD objects (Entity, ValueObject, AggregateRoot, DomainEvent) are created with `new` inside use cases and aggregates — they're per-transaction objects, not singletons. If you need a singleton domain service (e.g. a pricing engine with cached rules), define it as a port interface and bind it through beebear's container or any DI library of your choice. beebear's DI currently works with port interfaces (`Port<T>()`), not concrete classes directly.
- **Runtime immutability.** Entity `id` and DomainEvent fields use `Object.defineProperty` with `writable: false`. TypeScript `readonly` is compile-time only — these are enforced at runtime too.
- **Events are ephemeral.** The `_events` array lives for one transaction. After persistence/dispatch, clear events or let the aggregate get garbage collected.
- **No event dispatching.** This package provides the building blocks. Event bus, outbox pattern, and event sourcing are infrastructure concerns.

## What This Does NOT Provide

- Event dispatching / event bus
- Event sourcing / event store
- Repository base class (repos are ports — you define the interface)
- Saga / process manager
- Domain service base class (domain services are just classes)
- Serialization helpers

## License

MIT
