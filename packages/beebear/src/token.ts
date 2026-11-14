/**
 * A branded symbol type that carries phantom type information `T`.
 *
 * Used as a DI container lookup key. The phantom `__type` property exists
 * only at the type level — it is never present at runtime. This allows
 * `container.resolve(token)` to infer the correct return type without
 * manual type annotations.
 */
export type InjectionToken<T> = symbol & { readonly __type?: T };

/**
 * Creates a unique DI token for dependency injection.
 *
 * Each call returns a new, unique symbol branded with phantom type `T`.
 * This is the atomic primitive — `Port<T>()` is built on top of this.
 *
 * Intended for use with TypeScript declaration merging:
 *
 * ```ts
 * interface Cache {
 *   get(key: string): Promise<string | null>;
 *   set(key: string, value: string): Promise<void>;
 * }
 * const Cache = Token<Cache>('Cache');
 * ```
 *
 * Now `Cache` is both a type (the interface) and a value (the token).
 */
export function Token<T>(name: string): InjectionToken<T> {
  return Symbol(name) as InjectionToken<T>;
}
