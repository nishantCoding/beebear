import { describe, it, expect } from 'vitest';
import { DomainEvent } from '../index.js';

// --- Test fixtures ---

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

class NumericEvent extends DomainEvent {
  constructor(aggregateId: number) {
    super('NumericEvent', aggregateId);
  }
}

// --- Tests ---

describe('DomainEvent', () => {
  // --- Construction ---

  describe('construction', () => {
    it('sets eventName from constructor', () => {
      const event = new OrderPlaced('order-1', 99.99);
      expect(event.eventName).toBe('OrderPlaced');
    });

    it('sets aggregateId from constructor', () => {
      const event = new OrderPlaced('order-1', 99.99);
      expect(event.aggregateId).toBe('order-1');
    });

    it('auto-sets occurredAt to current time', () => {
      const before = Date.now();
      const event = new OrderPlaced('order-1', 99.99);
      const after = Date.now();

      expect(event.occurredAt).toBeInstanceOf(Date);
      expect((event.occurredAt as Date).getTime()).toBeGreaterThanOrEqual(before);
      expect((event.occurredAt as Date).getTime()).toBeLessThanOrEqual(after);
    });

    it('carries event-specific fields', () => {
      const event = new OrderPlaced('order-1', 99.99);
      expect(event.total).toBe(99.99);
    });

    it('supports string aggregateId', () => {
      const event = new OrderPlaced('order-uuid', 50);
      expect(event.aggregateId).toBe('order-uuid');
    });

    it('supports number aggregateId', () => {
      const event = new NumericEvent(42);
      expect(event.aggregateId).toBe(42);
    });
  });

  // --- Immutability ---

  describe('immutability', () => {
    it('eventName is readonly', () => {
      const event = new OrderPlaced('order-1', 99.99);
      expect(() => {
        (event as any).eventName = 'Changed';
      }).toThrow();
    });

    it('aggregateId is readonly', () => {
      const event = new OrderPlaced('order-1', 99.99);
      expect(() => {
        (event as any).aggregateId = 'changed';
      }).toThrow();
    });

    it('occurredAt is readonly', () => {
      const event = new OrderPlaced('order-1', 99.99);
      expect(() => {
        (event as any).occurredAt = new Date();
      }).toThrow();
    });
  });

  // --- Custom timestamp factory ---

  describe('timestampFactory', () => {
    it('uses custom factory when provided', () => {
      const fixed = new Date('2025-01-01T00:00:00Z');

      class CustomEvent extends DomainEvent {
        constructor(aggregateId: string) {
          super('CustomEvent', aggregateId, () => fixed);
        }
      }

      const event = new CustomEvent('agg-1');
      expect(event.occurredAt).toBe(fixed);
    });

    it('defaults to new Date() when factory not provided', () => {
      const before = Date.now();
      const event = new OrderPlaced('order-1', 99.99);
      const after = Date.now();

      expect(event.occurredAt).toBeInstanceOf(Date);
      expect((event.occurredAt as Date).getTime()).toBeGreaterThanOrEqual(before);
      expect((event.occurredAt as Date).getTime()).toBeLessThanOrEqual(after);
    });

    it('supports number-based timestamp (Date.now())', () => {
      class TimestampEvent extends DomainEvent {
        constructor(aggregateId: string) {
          super('TimestampEvent', aggregateId, () => Date.now());
        }
      }

      const event = new TimestampEvent('agg-1');
      expect(typeof event.occurredAt).toBe('number');
    });

    it('supports string-based timestamp (ISO string)', () => {
      class IsoEvent extends DomainEvent {
        constructor(aggregateId: string) {
          super('IsoEvent', aggregateId, () => new Date().toISOString());
        }
      }

      const event = new IsoEvent('agg-1');
      expect(typeof event.occurredAt).toBe('string');
    });
  });

  // --- instanceof ---

  describe('instanceof', () => {
    it('concrete event is instanceof DomainEvent', () => {
      const event = new OrderPlaced('order-1', 99.99);
      expect(event).toBeInstanceOf(DomainEvent);
    });

    it('different event types are both instanceof DomainEvent', () => {
      const a = new OrderPlaced('order-1', 99.99);
      const b = new ItemAdded('order-1', 'prod-abc');
      expect(a).toBeInstanceOf(DomainEvent);
      expect(b).toBeInstanceOf(DomainEvent);
    });

    it('concrete event is instanceof its own class', () => {
      const event = new OrderPlaced('order-1', 99.99);
      expect(event).toBeInstanceOf(OrderPlaced);
      expect(event).not.toBeInstanceOf(ItemAdded);
    });
  });
});
