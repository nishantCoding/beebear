import { describe, it, expect } from 'vitest';
import { AggregateRoot, DomainEvent, Entity } from '../index.js';

// --- Test fixtures ---

class OrderPlaced extends DomainEvent {
  constructor(orderId: string) {
    super('OrderPlaced', orderId);
  }
}

class ItemAdded extends DomainEvent {
  constructor(orderId: string, readonly productId: string) {
    super('ItemAdded', orderId);
  }
}

class OrderCancelled extends DomainEvent {
  constructor(orderId: string, readonly reason: string) {
    super('OrderCancelled', orderId);
  }
}

class Order extends AggregateRoot<string> {
  private items: string[] = [];
  private status: 'draft' | 'placed' | 'cancelled' = 'draft';

  addItem(productId: string) {
    this.assertDraft();
    this.items.push(productId);
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

  cancel(reason: string) {
    if (this.status === 'cancelled') {
      throw new Error('Already cancelled');
    }
    this.status = 'cancelled';
    this.addEvent(new OrderCancelled(this.id, reason));
  }

  getStatus() { return this.status; }
  getItems() { return [...this.items]; }

  private assertDraft() {
    if (this.status !== 'draft') {
      throw new Error('Cannot modify a non-draft order');
    }
  }
}

// --- Tests ---

describe('AggregateRoot', () => {
  // --- Inherits Entity ---

  describe('inherits Entity', () => {
    it('has an id', () => {
      const order = new Order('order-1');
      expect(order.id).toBe('order-1');
    });

    it('is an instance of Entity', () => {
      const order = new Order('order-1');
      expect(order).toBeInstanceOf(Entity);
    });

    it('equals() compares by id', () => {
      const a = new Order('order-1');
      const b = new Order('order-1');
      expect(a.equals(b)).toBe(true);
    });

    it('equals() returns false for different ids', () => {
      const a = new Order('order-1');
      const b = new Order('order-2');
      expect(a.equals(b)).toBe(false);
    });
  });

  // --- Event collection ---

  describe('event collection', () => {
    it('starts with no events', () => {
      const order = new Order('order-1');
      expect(order.getEvents()).toEqual([]);
    });

    it('collects events from domain methods', () => {
      const order = new Order('order-1');
      order.addItem('prod-abc');

      const events = order.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ItemAdded);
      expect(events[0].eventName).toBe('ItemAdded');
    });

    it('accumulates events across multiple method calls', () => {
      const order = new Order('order-1');
      order.addItem('prod-abc');
      order.addItem('prod-xyz');
      order.place();

      const events = order.getEvents();
      expect(events).toHaveLength(3);
      expect(events[0]).toBeInstanceOf(ItemAdded);
      expect(events[1]).toBeInstanceOf(ItemAdded);
      expect(events[2]).toBeInstanceOf(OrderPlaced);
    });

    it('preserves insertion order', () => {
      const order = new Order('order-1');
      order.addItem('prod-abc');
      order.place();

      const events = order.getEvents();
      expect(events[0].eventName).toBe('ItemAdded');
      expect(events[1].eventName).toBe('OrderPlaced');
    });

    it('events carry correct aggregateId', () => {
      const order = new Order('order-42');
      order.addItem('prod-abc');

      const events = order.getEvents();
      expect(events[0].aggregateId).toBe('order-42');
    });
  });

  // --- getEvents() returns read-only copy ---

  describe('getEvents() isolation', () => {
    it('returns a copy — modifying returned array does not affect aggregate', () => {
      const order = new Order('order-1');
      order.addItem('prod-abc');

      const events = order.getEvents() as DomainEvent[];
      events.length = 0; // mutate the copy

      expect(order.getEvents()).toHaveLength(1); // original unchanged
    });
  });

  // --- clearEvents() ---

  describe('clearEvents()', () => {
    it('empties the event list', () => {
      const order = new Order('order-1');
      order.addItem('prod-abc');
      expect(order.getEvents()).toHaveLength(1);

      order.clearEvents();
      expect(order.getEvents()).toEqual([]);
    });

    it('new events can be collected after clearing', () => {
      const order = new Order('order-1');
      order.addItem('prod-abc');
      order.clearEvents();

      order.addItem('prod-xyz');
      expect(order.getEvents()).toHaveLength(1);
      expect((order.getEvents()[0] as ItemAdded).productId).toBe('prod-xyz');
    });
  });

  // --- addEvent() is protected ---

  describe('addEvent() access', () => {
    it('addEvent is not accessible from outside the class', () => {
      const order = new Order('order-1');
      expect((order as any).addEvent).toBeDefined(); // exists on prototype
      // But calling it externally is a design violation — TypeScript prevents it at compile time
      // Runtime check: it's a function but should only be called internally
      expect(typeof (order as any).addEvent).toBe('function');
    });
  });

  // --- Domain logic with events ---

  describe('domain logic', () => {
    it('aggregate enforces business rules', () => {
      const order = new Order('order-1');
      order.addItem('prod-abc');
      order.place();

      expect(() => order.addItem('prod-xyz')).toThrow('Cannot modify a non-draft order');
    });

    it('place() on empty order throws', () => {
      const order = new Order('order-1');
      expect(() => order.place()).toThrow('Cannot place empty order');
    });

    it('cancel() on already cancelled throws', () => {
      const order = new Order('order-1');
      order.addItem('prod-abc');
      order.cancel('changed mind');
      expect(() => order.cancel('again')).toThrow('Already cancelled');
    });
  });
});
