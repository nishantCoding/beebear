import { describe, it, expect } from 'vitest';
import { Entity } from '../index.js';

// --- Test fixtures ---

class OrderItem extends Entity<string> {
  constructor(
    id: string,
    public productId: string,
    public quantity: number,
  ) {
    super(id);
  }
}

class Product extends Entity<string> {
  constructor(id: string, public name: string) {
    super(id);
  }
}

class NumericEntity extends Entity<number> {
  constructor(id: number, public label: string) {
    super(id);
  }
}

// --- Tests ---

describe('Entity', () => {
  // --- Construction ---

  describe('construction', () => {
    it('sets id in constructor', () => {
      const item = new OrderItem('item-1', 'prod-abc', 2);
      expect(item.id).toBe('item-1');
    });

    it('id is readonly', () => {
      const item = new OrderItem('item-1', 'prod-abc', 2);
      expect(() => {
        (item as any).id = 'item-2';
      }).toThrow();
    });

    it('supports string ids', () => {
      const item = new OrderItem('uuid-123', 'prod-abc', 1);
      expect(item.id).toBe('uuid-123');
    });

    it('supports number ids', () => {
      const entity = new NumericEntity(42, 'test');
      expect(entity.id).toBe(42);
    });
  });

  // --- Equality ---

  describe('equals()', () => {
    it('returns true for same class with same id', () => {
      const a = new OrderItem('item-1', 'prod-abc', 2);
      const b = new OrderItem('item-1', 'prod-xyz', 5);
      expect(a.equals(b)).toBe(true);
    });

    it('returns false for same class with different id', () => {
      const a = new OrderItem('item-1', 'prod-abc', 2);
      const b = new OrderItem('item-2', 'prod-abc', 2);
      expect(a.equals(b)).toBe(false);
    });

    it('returns false for different classes with same id', () => {
      const item = new OrderItem('1', 'prod-abc', 2);
      const product = new Product('1', 'Widget');
      expect(item.equals(product as any)).toBe(false);
    });

    it('returns false for null', () => {
      const item = new OrderItem('item-1', 'prod-abc', 2);
      expect(item.equals(null as any)).toBe(false);
    });

    it('returns false for undefined', () => {
      const item = new OrderItem('item-1', 'prod-abc', 2);
      expect(item.equals(undefined as any)).toBe(false);
    });
  });

  // --- Mutability ---

  describe('mutability', () => {
    it('properties other than id can be changed', () => {
      const item = new OrderItem('item-1', 'prod-abc', 2);
      item.quantity = 5;
      expect(item.quantity).toBe(5);
    });
  });
});
