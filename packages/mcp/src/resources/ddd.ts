export const DDD = `# @beebear-plugins/ddd

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
    if (props.amount < 0) throw new Error('Amount cannot be negative');
    if (!props.currency) throw new Error('Currency is required');
  }

  get amount(): number { return this.props.amount; }
  get currency(): string { return this.props.currency; }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('Cannot add different currencies');
    }
    return new Money({ amount: this.amount + other.amount, currency: this.currency });
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
    if (!name.trim()) throw new Error('Name cannot be empty');
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
    this.addEvent(new OrderItemAdded(this.id, productId, quantity));
  }

  submit(): void {
    if (this.items.length === 0) throw new Error('Cannot submit empty order');
    this._status = 'submitted';
    this.addEvent(new OrderSubmitted(this.id));
  }
}

const order = new Order('order-1');
order.addItem('prod-1', 2);
order.submit();

const events = order.getEvents();  // [OrderItemAdded, OrderSubmitted]
order.clearEvents();               // clears the internal event list
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

export class Order extends AggregateRoot<string> { /* ... */ }

// domain/use-cases/submit-order.use-case.ts — uses beebear
import type { UseCase } from 'beebear';
import { NotFoundError } from 'beebear';
import type { OrderRepository } from '../ports/outbound/order-repository.port';

export class SubmitOrderUseCase implements UseCase<{ orderId: string }, void> {
  constructor(private readonly orderRepo: OrderRepository) {}

  async execute(input: { orderId: string }): Promise<void> {
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) throw new NotFoundError('Order not found');
    order.submit();
    await this.orderRepo.save(order);
    // Dispatch order.getEvents() via event bus, then order.clearEvents()
  }
}
\`\`\`
`;
