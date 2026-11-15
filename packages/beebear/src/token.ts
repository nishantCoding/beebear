/**
 * A branded symbol type that carries phantom type information `T`.
 *
 * Used as a DI container lookup key. The phantom `__type` property exists
 * only at the type level — it is never present at runtime. This allows
 * `container.resolve(token)` to infer the correct return type without
 * manual type annotations.
 */
export type InjectionToken<T> = symbol & { readonly __type?: T };

// Global registry of token names — prevents accidental duplicate definitions.
const tokenNames = new Set<string>();

/**
 * Creates a unique DI token for dependency injection.
 *
 * Each call returns a new, unique symbol branded with phantom type `T`.
 * This is the atomic primitive — `Port<T>()` is built on top of this.
 *
 * Throws if a token with the same name has already been created.
 * Define each token once and import it everywhere.
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
  if (tokenNames.has(name)) {
    throw new Error(
      `Token "${name}" is already registered. Define each token once and import it everywhere.`,
    );
  }
  tokenNames.add(name);
  return Symbol(name) as InjectionToken<T>;
}

/**
 * Clears the global token name registry. For testing only.
 */
export function clearTokenRegistry(): void {
  tokenNames.clear();
}
