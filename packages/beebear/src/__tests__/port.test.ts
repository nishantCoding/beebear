import { describe, it, expect } from 'vitest';
import { Port } from '../port.js';
import { Token } from '../token.js';
import type { InjectionToken } from '../token.js';

describe('Port<T>()', () => {
  it('returns a symbol', () => {
    const token = Port<unknown>('Test');
    expect(typeof token).toBe('symbol');
  });

  it('sets the symbol description to the provided name', () => {
    const token = Port<unknown>('UserRepository');
    expect(token.description).toBe('UserRepository');
  });

  it('returns a unique symbol on every call', () => {
    const a = Port<unknown>('Same');
    const b = Port<unknown>('Same');
    expect(a).not.toBe(b);
  });

  it('returns the same InjectionToken<T> type as Token<T>()', () => {
    const portToken: InjectionToken<string> = Port<string>('Test');
    const tokenToken: InjectionToken<string> = Token<string>('Test');
    // Both are InjectionToken<string> — same type, different instances
    expect(typeof portToken).toBe('symbol');
    expect(typeof tokenToken).toBe('symbol');
  });

  it('supports the declaration merging pattern for hex arch ports', () => {
    interface UserRepository {
      findByEmail(email: string): Promise<unknown>;
      save(user: unknown): Promise<void>;
    }
    const UserRepository = Port<UserRepository>('UserRepository');

    expect(typeof UserRepository).toBe('symbol');
    expect(UserRepository.description).toBe('UserRepository');

    const checkType = (_repo: UserRepository): void => {};
    expect(typeof checkType).toBe('function');
  });
});
