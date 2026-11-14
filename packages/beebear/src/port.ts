import type { InjectionToken } from './token.js';
import { Token } from './token.js';

/**
 * Creates a port token for hexagonal architecture.
 *
 * Semantic alias for `Token<T>()`. Returns the same `InjectionToken<T>` type.
 * Use `Port<T>()` for hex arch ports (driving and driven) and `Token<T>()`
 * for general-purpose dependencies.
 *
 * ```ts
 * interface UserRepository {
 *   findByEmail(email: string): Promise<User | null>;
 *   save(user: User): Promise<void>;
 * }
 * const UserRepository = Port<UserRepository>('UserRepository');
 * ```
 */
export function Port<T>(name: string): InjectionToken<T> {
  return Token<T>(name);
}
