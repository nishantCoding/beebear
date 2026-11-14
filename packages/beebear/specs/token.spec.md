# Spec: Token<T>() — DI Token Factory

## Purpose

`Token<T>()` is the atomic primitive of beebear's DI system. It creates a
branded runtime symbol that serves as a container lookup key with compile-time
type safety.

This is general-purpose — it works for any injectable dependency in any
architecture (n-tier, hex arch, CQRS, etc.). It is not limited to hex arch
ports.

`Port<T>()` (hex arch port tokens) is built on top of `Token<T>()`.

---

## Public API

```ts
/**
 * A branded symbol type that carries phantom type information.
 * Used as a DI container key with type-safe resolution.
 */
export type InjectionToken<T> = symbol & { readonly __type?: T };

/**
 * Creates a unique DI token.
 *
 * @typeParam T - The type this token represents
 * @param name - A descriptive name (used as the symbol description)
 * @returns A unique branded symbol token carrying phantom type T
 */
export function Token<T>(name: string): InjectionToken<T>;
```

---

## Behavior Rules

1. **Returns a symbol.**
   `Token<T>(name)` returns a value whose `typeof` is `'symbol'`.

2. **Symbol description matches name.**
   The returned symbol's `.description` property equals the `name` argument.

3. **Every call creates a unique token.**
   Two calls with the same name return different symbols.
   `Token<Foo>('Foo') !== Token<Foo>('Foo')`.

4. **Phantom type is compile-time only.**
   The `__type` property does not exist at runtime.

5. **Declaration merging works.**
   The same identifier can be used as an `interface` (type) and a `const`
   (token value).

6. **Empty name is allowed.**
   `Token<T>('')` produces a valid token with empty description.

7. **Generic type parameter defaults to unknown.**
   `Token('Foo')` without `<T>` produces `InjectionToken<unknown>`.

---

## Type Constraints

- `InjectionToken<T>` is assignable to `symbol`
- `symbol` is NOT assignable to `InjectionToken<T>` (branded)
- `InjectionToken<A>` is NOT assignable to `InjectionToken<B>` when `A !== B`

---

## Non-Goals

- Does NOT register anything in a container
- Does NOT validate the name string
- Does NOT store tokens in a global registry
- Has NO side effects beyond creating a symbol

---

## Usage Example

```ts
import { Token } from 'beebear';

// General-purpose: any dependency
const PrismaClient = Token<PrismaClient>('PrismaClient');
const Logger = Token<Logger>('Logger');
const AppConfig = Token<AppConfig>('AppConfig');

// With declaration merging
interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
}
const Cache = Token<Cache>('Cache');

container.bind(Cache, () => new RedisCache(redisUrl));
const cache = container.resolve(Cache);  // type: Cache
```
