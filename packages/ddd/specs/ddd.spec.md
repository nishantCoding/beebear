# Spec: `@beebear-plugins/ddd` — Domain-Driven Design Building Blocks

## The Problem

beebear core is neutral about how you organize logic inside the hexagon.
The simplest approach is "fat use cases" — all business rules live in use
case classes, and domain objects are plain data holders:

```ts
class PlaceOrderUseCase {
  async execute(command: { orderId: string }) {
    const order = await this.orders.findById(command.orderId);

    // Business rule: can't place empty order
    if (order.items.length === 0) {
      throw new Error('Cannot place empty order');
    }

    // Business rule: can't place non-draft order
    if (order.status !== 'draft') {
      throw new Error('Order already placed or cancelled');
    }

    order.status = 'placed';
    await this.orders.save(order);
  }
}
```

This works fine for simple domains. But when multiple use cases touch the
same data, rules get duplicated:

```ts
class AddItemToOrderUseCase {
  async execute(command: { orderId: string; productId: string }) {
    const order = await this.orders.findById(command.orderId);

    // Same rule AGAIN — can't modify non-draft
    if (order.status !== 'draft') {
      throw new Error('Cannot modify a placed order');
    }

    // ...
  }
}
```

The rule "only draft orders can be modified" is scattered across every use
case that touches `Order`. If the rule changes, you must find and update
every occurrence.

---

## The Solution

Rich domain objects that enforce their own invariants. Use cases become
thin orchestrators — they load aggregates, call methods, and save.

```ts
// Domain object enforces its own rules
class Order extends AggregateRoot<string> {
  addItem(productId: string, quantity: number, price: Money) {
    this.assertDraft();  // defined ONCE, used by all methods
    // ...
    this.addEvent(new ItemAdded(this.id, productId));
  }

  place() {
    this.assertDraft();
    if (this.items.length === 0) {
      throw new Error('Cannot place empty order');
    }
    this.status = 'placed';
    this.addEvent(new OrderPlaced(this.id));
  }

  private assertDraft() {
    if (this.status !== 'draft') {
      throw new Error('Cannot modify a non-draft order');
    }
  }
}

// Use case is thin — one line of domain logic
class PlaceOrderUseCase {
  async execute(command: { orderId: string }) {
    const order = await this.orders.findById(command.orderId);
    if (!order) throw new NotFoundError('Order not found');
    order.place();  // all rules enforced inside
    await this.orders.save(order);
  }
}
```

`@beebear-plugins/ddd` provides four base classes to support this pattern:
**ValueObject**, **Entity**, **AggregateRoot**, and **DomainEvent**.

---

## Public API

### `ValueObject<TProps>`

Abstract base class for immutable objects defined by their properties,
not by identity. Two value objects with the same properties are equal.

```ts
export abstract class ValueObject<TProps extends Record<string, unknown>> {
  protected readonly props: Readonly<TProps>;

  constructor(props: TProps) {
    this.validate(props);
    this.props = Object.freeze({ ...props });
  }

  /**
   * Validation hook. Called in constructor before props are stored.
   * Throw an error if props are invalid. Optional — defaults to no-op.
   */
  protected validate(props: TProps): void {}

  /**
   * Structural equality — compares all props by value.
   * Returns true if `other` is the same class and all props are equal.
   */
  equals(other: ValueObject<TProps>): boolean;
}
```

**Key characteristics:**
- Immutable — `props` is frozen, no setters
- `validate()` is optional (defaults to no-op), called before props are stored
- `equals()` compares by value (deep structural equality on props)
- Mutation methods return new instances: `money.add(other)` returns a new `Money`
- No identity — not tracked by ID

### `Entity<TId>`

Abstract base class for objects with unique identity that persists over time.
Two entities with the same ID are the same entity, even if properties differ.

```ts
export abstract class Entity<TId extends string | number> {
  readonly id: TId;

  constructor(id: TId) {
    this.id = id;
  }

  /**
   * Identity equality — compares by id only.
   * Returns true if `other` is the same class and has the same id.
   */
  equals(other: Entity<TId>): boolean;
}
```

**Key characteristics:**
- Has identity (`id`), set once in constructor, readonly
- `equals()` compares by `id` only, not by properties
- Mutable — properties can change over the entity's lifecycle
- `TId` constrained to `string | number`

### `AggregateRoot<TId>`

Extends Entity. Serves as the single entry point for a cluster of related
objects. External code never reaches inside to modify child entities directly.
Collects domain events.

```ts
export abstract class AggregateRoot<TId extends string | number> extends Entity<TId> {
  private _events: DomainEvent[] = [];

  /**
   * Collect a domain event. Called from within aggregate methods.
   * Events are NOT dispatched — just collected for later retrieval.
   */
  protected addEvent(event: DomainEvent): void;

  /**
   * Returns all collected events (read-only copy).
   * Infrastructure calls this after saving to dispatch events.
   */
  getEvents(): ReadonlyArray<DomainEvent>;

  /**
   * Clears the collected events.
   * Infrastructure calls this after events have been dispatched.
   */
  clearEvents(): void;
}
```

**Key characteristics:**
- Is-a Entity (has `id`, `equals()`)
- Collects domain events via `addEvent()` (protected — only the aggregate itself calls it)
- `getEvents()` returns a read-only copy of collected events
- `clearEvents()` empties the event list (called by infrastructure after dispatch)
- Repository saves/loads the entire aggregate — never child entities directly
- No DI involvement — created with `new` or loaded from repository per request

### `DomainEvent`

Abstract base class for events emitted by aggregate roots. Each concrete
event is a separate class extending `DomainEvent`.

```ts
export abstract class DomainEvent {
  readonly occurredAt: Date;

  constructor(
    readonly eventName: string,
    readonly aggregateId: string | number,
  ) {
    this.occurredAt = new Date();
  }
}
```

**Key characteristics:**
- `eventName` — identifies the event type (e.g. `'OrderPlaced'`)
- `aggregateId` — ID of the aggregate that emitted the event
- `occurredAt` — auto-set to current time in constructor
- Developer extends for each event type, adding event-specific fields
- Events are data — they describe something that happened, not commands
- No DI — created with `new` inside aggregate methods

---

## Behavior Rules

### ValueObject

1. **Constructor calls `validate()` before storing props.** If `validate()`
   throws, the object is not created.

2. **`validate()` defaults to no-op.** Subclasses override it to add
   validation rules. Not abstract — simple value objects can skip it.

3. **Props are frozen after construction.** `this.props` is `Object.freeze()`'d.
   Mutating `props` from outside has no effect (silent in sloppy mode,
   throws in strict mode).

4. **`equals()` returns true when:** both objects are instances of the
   same class AND all props are deeply equal (shallow comparison of
   each key's value).

5. **`equals()` returns false when:** classes differ, or any prop value differs.

6. **`equals()` handles null/undefined.** Returns false if `other` is
   null or undefined.

7. **Mutation methods return new instances.** Value objects are immutable.
   Methods like `money.add(other)` return a new `Money`, never modify `this`.
   This is a convention enforced by the developer, not the base class.

8. **No identity.** Value objects have no `id` property. They're compared
   by value, not by reference or identifier.

### Entity

9. **`id` is set once in constructor and is readonly.** Cannot be changed
   after construction.

10. **`equals()` compares by `id` only.** Two entities of the same class
    with the same `id` are equal, regardless of other property values.

11. **`equals()` checks class identity.** An `OrderItem` with id `'1'` does
    NOT equal a `Product` with id `'1'` — different classes, even if same id type.

12. **`equals()` handles null/undefined.** Returns false if `other` is
    null or undefined.

13. **`TId` is constrained to `string | number`.** Covers UUIDs, auto-increment
    IDs, and composite keys (as strings). No symbol or object IDs.

14. **Entities are mutable.** Properties can change over the entity's lifecycle.
    The base class doesn't enforce immutability (unlike ValueObject).

### AggregateRoot

15. **Inherits all Entity behavior.** Has `id`, `equals()`, same rules.

16. **`addEvent()` is protected.** Only the aggregate itself (or subclasses)
    can add events. External code cannot inject events into an aggregate.

17. **`getEvents()` returns a read-only copy.** Modifying the returned array
    does not affect the aggregate's internal event list.

18. **`clearEvents()` empties the internal event list.** After calling
    `clearEvents()`, `getEvents()` returns an empty array.

19. **Events accumulate across method calls.** Calling `order.addItem()`
    then `order.place()` collects both `ItemAdded` and `OrderPlaced` events.
    They're not cleared between method calls — only when `clearEvents()`
    is explicitly called.

20. **Events are ordered.** `getEvents()` returns events in the order they
    were added (insertion order preserved).

21. **No automatic dispatch.** The aggregate collects events. Infrastructure
    (repository, use case, event bus) is responsible for reading them via
    `getEvents()` and dispatching. The aggregate never publishes events itself.

### DomainEvent

22. **`occurredAt` is auto-set.** The constructor sets it to `new Date()`.
    The developer does not pass a timestamp — it's always "now".

23. **`eventName` identifies the event type.** Convention: use the class name
    (e.g. `'OrderPlaced'`). Passed via `super()` call.

24. **`aggregateId` links the event to its source aggregate.** Passed via
    `super()` call.

25. **Events are immutable data.** All properties are `readonly`. Events
    describe what happened — they cannot be modified after creation.

26. **One class per event type.** `OrderPlaced`, `ItemAdded`,
    `OrderCancelled` are each separate classes extending `DomainEvent`.

---

## Error Cases

| Scenario | Error |
|---|---|
| ValueObject `validate()` throws | Whatever the developer throws (their validation logic) |
| Mutating frozen props (strict mode) | `TypeError` from `Object.freeze()` |
| `equals()` with null/undefined | Returns `false` (no throw) |

The base classes themselves throw minimally. Domain-specific errors
(e.g. "Cannot place empty order") are thrown by the developer's subclass
methods, not by the base classes.

---

## Usage Examples

### ValueObject — Money

```ts
import { ValueObject } from '@beebear-plugins/ddd';

class Money extends ValueObject<{ amount: number; currency: string }> {
  protected validate(props: { amount: number; currency: string }) {
    if (props.amount < 0) throw new Error('Amount cannot be negative');
    if (!props.currency) throw new Error('Currency is required');
  }

  get amount() { return this.props.amount; }
  get currency() { return this.props.currency; }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('Cannot add different currencies');
    }
    return new Money({ amount: this.amount + other.amount, currency: this.currency });
  }
}

const a = new Money({ amount: 100, currency: 'USD' });
const b = new Money({ amount: 100, currency: 'USD' });
a.equals(b);  // true

const c = a.add(new Money({ amount: 50, currency: 'USD' }));
c.amount;  // 150
```

### ValueObject — Email

```ts
class Email extends ValueObject<{ value: string }> {
  protected validate(props: { value: string }) {
    if (!props.value.includes('@')) {
      throw new Error('Invalid email address');
    }
  }

  get value() { return this.props.value; }

  toString() { return this.value; }
}

const email = new Email({ value: 'alice@example.com' });
```

### Entity — OrderItem

```ts
import { Entity } from '@beebear-plugins/ddd';

class OrderItem extends Entity<string> {
  constructor(
    id: string,
    public productId: string,
    public quantity: number,
    public price: Money,
  ) {
    super(id);
  }
}

const item1 = new OrderItem('item-1', 'prod-abc', 2, new Money({ amount: 50, currency: 'USD' }));
const item2 = new OrderItem('item-1', 'prod-abc', 5, new Money({ amount: 50, currency: 'USD' }));
item1.equals(item2);  // true — same ID
```

### DomainEvent — OrderPlaced, ItemAdded

```ts
import { DomainEvent } from '@beebear-plugins/ddd';

class OrderPlaced extends DomainEvent {
  constructor(orderId: string, readonly total: number) {
    super('OrderPlaced', orderId);
  }
}

class ItemAdded extends DomainEvent {
  constructor(orderId: string, readonly productId: string) {
    super('ItemAdded', orderId);
  }
}

const event = new OrderPlaced('order-1', 99.99);
event.eventName;    // 'OrderPlaced'
event.aggregateId;  // 'order-1'
event.occurredAt;   // Date (auto-set)
event.total;        // 99.99
event instanceof DomainEvent;  // true
```

### AggregateRoot — Order (full example)

```ts
import { AggregateRoot } from '@beebear-plugins/ddd';

class Order extends AggregateRoot<string> {
  private items: OrderItem[] = [];
  private status: 'draft' | 'placed' | 'cancelled' = 'draft';

  addItem(productId: string, quantity: number, price: Money) {
    this.assertDraft();
    if (this.items.some(i => i.productId === productId)) {
      throw new Error('Product already in order');
    }
    this.items.push(new OrderItem(generateId(), productId, quantity, price));
    this.addEvent(new ItemAdded(this.id, productId));
  }

  place() {
    this.assertDraft();
    if (this.items.length === 0) {
      throw new Error('Cannot place empty order');
    }
    this.status = 'placed';
    this.addEvent(new OrderPlaced(this.id, this.total.amount));
  }

  cancel(reason: string) {
    if (this.status === 'cancelled') {
      throw new Error('Already cancelled');
    }
    this.status = 'cancelled';
    this.addEvent(new OrderCancelled(this.id, reason));
  }

  get total(): Money {
    return this.items.reduce(
      (sum, item) => sum.add(new Money({
        amount: item.price.amount * item.quantity,
        currency: item.price.currency,
      })),
      new Money({ amount: 0, currency: 'USD' }),
    );
  }

  private assertDraft() {
    if (this.status !== 'draft') {
      throw new Error('Cannot modify a non-draft order');
    }
  }
}
```

### Integration with Use Case

```ts
import { Port } from 'beebear';
import type { UseCase } from 'beebear';

interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
}
const OrderRepository = Port<OrderRepository>('OrderRepository');

interface PlaceOrder extends UseCase<{ orderId: string }, { orderId: string }> {}
const PlaceOrder = Port<PlaceOrder>('PlaceOrder');

class PlaceOrderService implements PlaceOrder {
  constructor(private orders: OrderRepository) {}

  async execute(input: { orderId: string }) {
    const order = await this.orders.findById(input.orderId);
    if (!order) throw new NotFoundError('Order not found');

    order.place();  // one line — all rules enforced

    await this.orders.save(order);
    // Infrastructure can read order.getEvents() after save
    // to dispatch to event bus, then order.clearEvents()

    return { orderId: order.id };
  }
}
```

---

## Non-Goals

- **No event dispatching / event bus.** Aggregates collect events. Dispatching
  is infrastructure's responsibility (or future `@beebear-plugins/cqrs`).
- **No event sourcing / event store.** Events here are for side effects
  (notifications, projections), not as the source of truth.
- **No repository base class.** Repositories are driven ports — the developer
  defines the interface, the adapter implements it. No `Repository<T>` base.
- **No saga / process manager.** Cross-aggregate coordination is a separate concern.
- **No domain service base class.** Domain services are plain classes with
  business logic that doesn't belong to any single aggregate. No base needed.
- **No serialization helpers.** How aggregates are persisted (JSON, ORM,
  event store) is the adapter's concern.
- **No validation library integration.** `validate()` is a plain method.
  The developer can use Zod, Joi, or plain `if` statements inside it.
- **No DI container integration.** DDD objects are not registered as tokens.
  They're created by domain logic, not resolved from a container.
