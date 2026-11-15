import { describe, it, expect, beforeEach } from 'vitest';
import { Token, clearTokenRegistry } from '../token.js';
import type { InjectionToken } from '../token.js';

beforeEach(() => {
  clearTokenRegistry();
});

describe('Token<T>()', () => {
  // --- Core behavior ---

  it('returns a symbol', () => {
    const token = Token<unknown>('Test');
    expect(typeof token).toBe('symbol');
  });

  it('sets the symbol description to the provided name', () => {
    const token = Token<unknown>('UserRepository');
    expect(token.description).toBe('UserRepository');
  });

  it('throws on duplicate name', () => {
    Token<unknown>('Dup');
    expect(() => Token<unknown>('Dup')).toThrow(
      'Token "Dup" is already registered. Define each token once and import it everywhere.',
    );
  });

  it('creates distinct tokens for different names', () => {
    const a = Token<unknown>('Foo');
    const b = Token<unknown>('Bar');
    expect(a).not.toBe(b);
    expect(a.description).toBe('Foo');
    expect(b.description).toBe('Bar');
  });

  // --- Phantom type (compile-time only) ---

  it('does not have __type property at runtime', () => {
    const token = Token<{ foo: string }>('Typed');
    expect(Object.getOwnPropertyNames(token)).not.toContain('__type');
  });

  // --- Edge cases ---

  it('handles empty string name', () => {
    const token = Token<unknown>('');
    expect(typeof token).toBe('symbol');
    expect(token.description).toBe('');
  });

  it('handles names with special characters', () => {
    const token = Token<unknown>('my-service.v2/test');
    expect(token.description).toBe('my-service.v2/test');
  });

  // --- Type safety (compile-time verification) ---

  it('token is assignable to symbol', () => {
    const token: InjectionToken<string> = Token<string>('AssignTest');
    const sym: symbol = token;
    expect(typeof sym).toBe('symbol');
  });

  it('supports the declaration merging pattern', () => {
    interface Cache {
      get(key: string): Promise<string | null>;
    }
    const Cache = Token<Cache>('Cache');

    expect(typeof Cache).toBe('symbol');
    expect(Cache.description).toBe('Cache');

    const checkType = (_cache: Cache): void => {};
    expect(typeof checkType).toBe('function');
  });

  // --- clearTokenRegistry ---

  it('clearTokenRegistry allows reuse of names', () => {
    Token<unknown>('Reuse');
    clearTokenRegistry();
    const t = Token<unknown>('Reuse');
    expect(typeof t).toBe('symbol');
  });
});
