# DDD Basics: Where Does Business Logic Live?

> This note explains the difference between DDD and non-DDD approaches inside
> the hexagon, and when each makes sense.

---

## 1. The Core Question

Hexagonal architecture says: business logic lives **inside the hexagon**.
But WHERE inside? There are two valid approaches.

---

## 2. Without DDD — Logic in Use Cases

The use case is a "fat" orchestrator. Domain objects are plain data holders.

```ts
// Domain object — just data, no behavior
interface Order {
  id: string;
  items: OrderItem[];
  status: 'draft' | 'placed' | 'cancelled';
}

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  price: number;
}

// Use case — ALL business rules live here
class PlaceOrderUseCase {
  constructor(private orders: OrderRepository) {}

  async execute(command: { orderId: string }) {
    const order = await this.orders.findById(command.orderId);
    if (!order) throw new NotFoundError('Order not found');

    // Business rule: can't place empty order
    if (order.items.length === 0) {
      throw new DomainError('Cannot place empty order');
    }

    // Business rule: can't place non-draft order
    if (order.status !== 'draft') {
      throw new DomainError('Order already placed or cancelled');
    }

    // Business rule: total must be positive
    const total = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    if (total <= 0) {
      throw new DomainError('Order total must be positive');
    }

    // Mutation
    order.status = 'placed';
    await this.orders.save(order);

    return { orderId: order.id, total };
  }
}
```

### The Problem: Rule Duplication

Now imagine another use case also needs to modify orders:

```ts
class AddItemToOrderUseCase {
  async execute(command: { orderId: string; productId: string; quantity: number; price: number }) {
    const order = await this.orders.findById(command.orderId);

    // Same rule AGAIN — can't modify non-draft
    if (order.status !== 'draft') {
      throw new DomainError('Cannot modify a placed order');
    }

    // Same rule AGAIN — no duplicate products
    if (order.items.some(i => i.productId === command.productId)) {
      throw new DomainError('Product already in order');
    }

    order.items.push({ id: generateId(), ...command });
    await this.orders.save(order);
  }
}
```

Rules like "only draft orders can be modified" are scattered across multiple
use cases. If the rule changes, you must find and update every use case.

**For simple domains (CRUD-heavy, few rules), this is fine.**
**For complex domains (many rules, many use cases touching the same data), this breaks down.**

---

## 3. With DDD — Logic in Domain Objects

Domain objects are "rich" — they contain behavior, enforce their own rules.
Use cases become thin orchestrators.

### Value Object

An immutable object defined by its properties, not by identity.
Two value objects with the same properties are equal.

```ts
class Money extends ValueObject<{ amount: number; currency: string }> {
  protected validate(props: { amount: number; currency: string }) {
    if (props.amount < 0) throw new ValidationError('Amount cannot be negative');
    if (!props.currency) throw new ValidationError('Currency is required');
  }

  get amount() { return this.props.amount; }
  get currency() { return this.props.currency; }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new DomainError('Cannot add different currencies');
    }
    return new Money({ amount: this.amount + other.amount, currency: this.currency });
  }
}

const a = new Money({ amount: 100, currency: 'USD' });
const b = new Money({ amount: 100, currency: 'USD' });
a.equals(b);  // true — same value, same object conceptually
```

**Real-world value objects:** Email, Address, PhoneNumber, DateRange, Color,
Coordinates, Money, Percentage, Quantity.

**Rule of thumb:** If you'd compare it by its contents (not by an ID), it's a value object.

### Entity

An object with a unique identity that persists over time. Two entities with
the same ID are the same entity, even if their properties differ.

```ts
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
item1.equals(item2);  // true — same ID, even though quantity differs
```

**Real-world entities:** User, Product, OrderItem, Payment, Subscription.

**Rule of thumb:** If it has a lifecycle and you track it by ID, it's an entity.

### Aggregate Root

An entity that serves as the ONLY entry point for a cluster of related objects.
External code never reaches inside to modify child entities directly.

```ts
class Order extends AggregateRoot<string> {
  private items: OrderItem[] = [];
  private status: 'draft' | 'placed' | 'cancelled' = 'draft';

  // ---- All mutations go through methods on the root ----

  addItem(productId: string, quantity: number, price: Money) {
    this.assertDraft();  // reusable guard — defined once
    if (this.items.some(i => i.productId === productId)) {
      throw new DomainError('Product already in order');
    }
    this.items.push(new OrderItem(generateId(), productId, quantity, price));
    this.addEvent(new ItemAdded(this.id, productId));
  }

  removeItem(itemId: string) {
    this.assertDraft();
    const index = this.items.findIndex(i => i.id === itemId);
    if (index === -1) throw new NotFoundError('Item not found');
    this.items.splice(index, 1);
  }

  updateItemQuantity(itemId: string, quantity: number) {
    this.assertDraft();
    if (quantity <= 0) throw new ValidationError('Quantity must be positive');
    const item = this.items.find(i => i.id === itemId);
    if (!item) throw new NotFoundError('Item not found');
    item.quantity = quantity;
  }

  place() {
    this.assertDraft();
    if (this.items.length === 0) {
      throw new DomainError('Cannot place empty order');
    }
    this.status = 'placed';
    this.addEvent(new OrderPlaced(this.id));
  }

  cancel(reason: string) {
    if (this.status === 'cancelled') {
      throw new DomainError('Already cancelled');
    }
    this.status = 'cancelled';
    this.addEvent(new OrderCancelled(this.id, reason));
  }

  get total(): Money {
    return this.items.reduce(
      (sum, item) => sum.add(new Money({ amount: item.price.amount * item.quantity, currency: item.price.currency })),
      new Money({ amount: 0, currency: 'USD' }),
    );
  }

  // ---- Private guard — defined ONCE, used by all methods ----

  private assertDraft() {
    if (this.status !== 'draft') {
      throw new DomainError('Cannot modify a non-draft order');
    }
  }
}
```

Now the use cases are thin:

```ts
class PlaceOrderUseCase {
  constructor(private orders: OrderRepository) {}

  async execute(command: { orderId: string }) {
    const order = await this.orders.findById(command.orderId);
    if (!order) throw new NotFoundError('Order not found');

    order.place();  // ONE line — all rules enforced inside

    await this.orders.save(order);
  }
}

class AddItemToOrderUseCase {
  constructor(private orders: OrderRepository, private products: ProductRepository) {}

  async execute(command: { orderId: string; productId: string; quantity: number }) {
    const order = await this.orders.findById(command.orderId);
    if (!order) throw new NotFoundError('Order not found');

    const product = await this.products.findById(command.productId);
    if (!product) throw new NotFoundError('Product not found');

    order.addItem(command.productId, command.quantity, product.price);  // ONE line

    await this.orders.save(order);
  }
}
```

**Key benefit:** The rule "only draft orders can be modified" is defined ONCE
inside `assertDraft()`. Every use case that touches `Order` automatically
gets that rule enforced. If the rule changes, you change it in one place.

---

## 4. The Relationship Between Them

```
Aggregate Root   ──contains──▶  Entities   ──contains──▶  Value Objects
   (Order)                     (OrderItem)                (Money, Email)
      │
      │ is-a
      ▼
   Entity
```

- **Value Object** → no identity, compared by value, immutable
- **Entity** → has identity (ID), compared by ID, mutable
- **Aggregate Root** → IS an entity, plus: single entry point, controls children,
  collects domain events, unit of persistence (repository saves/loads the whole aggregate)

---

## 5. Repository Interaction

The repository works with aggregate roots, not child entities:

```ts
// Port (driven)
interface OrderRepository {
  findById(id: string): Promise<Order | null>;  // returns aggregate root
  save(order: Order): Promise<void>;             // receives aggregate root
}
```

The repository saves the ENTIRE aggregate (root + children). There is NO
`OrderItemRepository`. If you want to add an item, you:

1. Load the `Order` aggregate root from the repository
2. Call `order.addItem(...)` — the root modifies its internals
3. Save the `Order` back to the repository

```ts
// RIGHT — interact through the aggregate root
const order = await orderRepo.findById(id);
order.addItem(productId, quantity, price);
await orderRepo.save(order);

// WRONG — no separate repository for child entities
const item = await orderItemRepo.findById(itemId);  // this should NOT exist
item.quantity = 5;
await orderItemRepo.save(item);
```

---

## 6. When to Use Which

| Factor | Without DDD (logic in use cases) | With DDD (logic in domain objects) |
|--------|------|------|
| Domain complexity | Simple, few rules | Complex, many interrelated rules |
| Rule duplication | Acceptable if few use cases | Eliminated — rules defined once on aggregates |
| Number of use cases touching same data | Few (1-3) | Many (5+) |
| Team size | Small team, everyone knows the rules | Large team, rules must be discoverable |
| App type | CRUD-heavy, data pipelines | Business-heavy, workflows, state machines |
| Learning curve | Low | Higher — must understand Entity/VO/Aggregate |
| Testing | Test use cases | Test domain objects in isolation (even simpler) |

**Examples:**
- Blog platform (CRUD posts, comments) → probably don't need DDD
- E-commerce (orders, payments, inventory, shipping rules) → DDD helps
- TODO app → definitely don't need DDD
- Banking (accounts, transactions, compliance rules) → DDD strongly recommended

---

## 7. Both Work Inside Hexagonal Architecture

```
┌─────────────────────────────────────────────────┐
│              INSIDE THE HEXAGON                  │
│                                                   │
│  Without DDD:           With DDD:                │
│  ┌──────────────┐       ┌──────────────┐         │
│  │  Use Case     │       │  Use Case     │        │
│  │  (fat: all    │       │  (thin:       │        │
│  │   rules here) │       │   orchestrate)│        │
│  └──────────────┘       └──────┬───────┘         │
│                                 │                  │
│  ┌──────────────┐       ┌──────▼───────┐         │
│  │ Plain objects │       │ Aggregate    │         │
│  │ (data only,   │       │ Root         │         │
│  │  no behavior) │       │ (rules here) │         │
│  └──────────────┘       │  ├─ Entity    │         │
│                          │  └─ ValueObj  │         │
│                          └──────────────┘         │
│                                                   │
│         ┌──────────┐                              │
│         │  Ports    │  ← same in both approaches  │
│         └──────────┘                              │
└─────────────────────────────────────────────────┘
                    │
              OUTSIDE (adapters)
```

Hexagonal architecture enforces the boundary. What you do INSIDE is your choice.
beebear core works with both approaches. `@beebear/ddd` adds tooling for the
DDD approach — base classes, event infrastructure, etc.
