import { describe, it, expect } from 'vitest';
import { ValueObject } from '../index.js';

// --- Test fixtures ---

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

class SimpleVO extends ValueObject<{ value: string }> {
  get value() { return this.props.value; }
}

// --- Tests ---

describe('ValueObject', () => {
  // --- Construction ---

  describe('construction', () => {
    it('creates a value object with valid props', () => {
      const money = new Money({ amount: 100, currency: 'USD' });
      expect(money.amount).toBe(100);
      expect(money.currency).toBe('USD');
    });

    it('calls validate() before storing props', () => {
      expect(() => new Money({ amount: -1, currency: 'USD' })).toThrow('Amount cannot be negative');
    });

    it('validate() throws on missing required field', () => {
      expect(() => new Money({ amount: 100, currency: '' })).toThrow('Currency is required');
    });

    it('works without validate() override (defaults to no-op)', () => {
      const vo = new SimpleVO({ value: 'hello' });
      expect(vo.value).toBe('hello');
    });
  });

  // --- Immutability ---

  describe('immutability', () => {
    it('props are frozen after construction', () => {
      const money = new Money({ amount: 100, currency: 'USD' });
      expect(() => {
        (money as any).props.amount = 999;
      }).toThrow(); // Object.freeze in strict mode
    });

    it('mutation methods return new instances', () => {
      const a = new Money({ amount: 100, currency: 'USD' });
      const b = new Money({ amount: 50, currency: 'USD' });
      const c = a.add(b);

      expect(c.amount).toBe(150);
      expect(a.amount).toBe(100); // original unchanged
      expect(c).not.toBe(a);
    });
  });

  // --- Equality ---

  describe('equals()', () => {
    it('returns true for same class with same props', () => {
      const a = new Money({ amount: 100, currency: 'USD' });
      const b = new Money({ amount: 100, currency: 'USD' });
      expect(a.equals(b)).toBe(true);
    });

    it('returns false for same class with different props', () => {
      const a = new Money({ amount: 100, currency: 'USD' });
      const b = new Money({ amount: 200, currency: 'USD' });
      expect(a.equals(b)).toBe(false);
    });

    it('returns false for different classes with same props shape', () => {
      class OtherMoney extends ValueObject<{ amount: number; currency: string }> {
        get amount() { return this.props.amount; }
        get currency() { return this.props.currency; }
      }

      const a = new Money({ amount: 100, currency: 'USD' });
      const b = new OtherMoney({ amount: 100, currency: 'USD' });
      expect(a.equals(b)).toBe(false);
    });

    it('returns false for null', () => {
      const a = new Money({ amount: 100, currency: 'USD' });
      expect(a.equals(null as any)).toBe(false);
    });

    it('returns false for undefined', () => {
      const a = new Money({ amount: 100, currency: 'USD' });
      expect(a.equals(undefined as any)).toBe(false);
    });
  });

  // --- No identity ---

  describe('no identity', () => {
    it('has no id property', () => {
      const money = new Money({ amount: 100, currency: 'USD' });
      expect((money as any).id).toBeUndefined();
    });
  });
});
