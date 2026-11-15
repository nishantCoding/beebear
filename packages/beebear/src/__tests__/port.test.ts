import { describe, it, expect, beforeEach } from 'vitest';
import { Port } from '../port.js';
import { Token, clearTokenRegistry } from '../token.js';
import type { InjectionToken } from '../token.js';

beforeEach(() => {
  clearTokenRegistry();
});

describe('Port<T>()', () => {
  it('returns a symbol', () => {
    const token = Port<unknown>('PortTest');
    expect(typeof token).toBe('symbol');
  });

  it('sets the symbol description to the provided name', () => {
    const token = Port<unknown>('UserRepository');
    expect(token.description).toBe('UserRepository');
  });

  it('throws on duplicate name (same guard as Token)', () => {
    Port<unknown>('DupPort');
    expect(() => Port<unknown>('DupPort')).toThrow(
      'Token "DupPort" is already registered. Define each token once and import it everywhere.',
    );
  });

  it('returns the same InjectionToken<T> type as Token<T>()', () => {
    const portToken: InjectionToken<string> = Port<string>('PortTyped');
    const tokenToken: InjectionToken<string> = Token<string>('TokenTyped');
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
