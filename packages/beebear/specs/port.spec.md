# Spec: Port<T>() — Hex Arch Port Token

## Purpose

`Port<T>()` is a semantic wrapper over `Token<T>()` for hexagonal architecture.
It creates a DI token specifically intended for port interfaces (driving and
driven ports).

Functionally identical to `Token<T>()`. The distinction is purely semantic —
it signals "this is a hex arch port" in the codebase.

---

## Public API

```ts
/**
 * Creates a port token for hexagonal architecture.
 * Alias for Token<T>() with hex arch semantics.
 *
 * @typeParam T - The port interface type
 * @param name - A descriptive name for the port
 * @returns A unique InjectionToken<T>
 */
export function Port<T>(name: string): InjectionToken<T>;
```

`Port<T>()` returns `InjectionToken<T>` — the same type that `Token<T>()`
returns. There is no separate `PortToken` type. The container treats both
identically.

---

## Relationship to Token<T>

```ts
// Implementation:
export function Port<T>(name: string): InjectionToken<T> {
  return Token<T>(name);
}
```

That's it. `Port<T>()` calls `Token<T>()`. Same symbol, same branded type,
same behavior. The only difference is the function name — which communicates
intent to the reader.

---

## When to Use Port<T> vs Token<T>

| Use `Port<T>()` for | Use `Token<T>()` for |
|----------------------|----------------------|
| Repository interfaces | External library clients (PrismaClient, Redis) |
| Use case interfaces | Configuration objects |
| Service port interfaces | Loggers, utilities |
| Any hex arch port (driving or driven) | Anything that's not a hex arch port |

Both are valid anywhere. The container doesn't distinguish between them.
This is a convention for code readability, not a technical constraint.

---

## Usage Example

```ts
import { Port, Token } from 'beebear';

// Hex arch ports — use Port<T>()
interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
const UserRepository = Port<UserRepository>('UserRepository');

interface RegisterUser {
  execute(input: { email: string }): Promise<{ id: string }>;
}
const RegisterUser = Port<RegisterUser>('RegisterUser');

// Infrastructure / general deps — use Token<T>()
const PrismaClient = Token<PrismaClient>('PrismaClient');
const Logger = Token<Logger>('Logger');

// Container treats them identically
container.bind(PrismaClient, () => new PrismaClient());
container.bind(Logger, () => new ConsoleLogger());
container.bind(UserRepository, (c) => new PrismaUserRepo(c.resolve(PrismaClient)));
container.bind(RegisterUser, (c) => new RegisterUserService(
  c.resolve(UserRepository),
));
```
