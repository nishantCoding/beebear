# Spec: `@beebear-plugins/di-decorators` — Optional Decorator-Based DI

## The Problem

beebear core uses explicit factory functions for DI:

```ts
container.bind(RegisterUser, (c) => new RegisterUserService(
  c.resolve(UserRepository),
  c.resolve(EmailService),
));
```

This is clear and debuggable, but some teams prefer the decorator style
they know from NestJS, tsyringe, or Angular:

```ts
@Injectable(RegisterUser)
class RegisterUserService {
  constructor(
    @Inject(UserRepository) private repo: UserRepository,
    @Inject(EmailService) private mailer: EmailService,
  ) {}
}
```

The decorator plugin provides this style as an opt-in addition to beebear.

---

## The Solution

A separate package `@beebear-plugins/di-decorators` that provides two decorators and
a container wrapper:

```ts
import { Port, createContainer, createHexApp } from 'beebear';
import { Injectable, Inject, withDecorators } from '@beebear-plugins/di-decorators';

// Ports are defined the same way (beebear core — no change)
interface RegisterUser extends UseCase<{ email: string }, { id: string }> {}
const RegisterUser = Port<RegisterUser>('RegisterUser');

interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
}
const UserRepository = Port<UserRepository>('UserRepository');

// Implementations use decorators instead of factory functions
@Injectable(RegisterUser)
class RegisterUserService implements RegisterUser {
  constructor(
    @Inject(UserRepository) private repo: UserRepository,
  ) {}

  async execute(input: { email: string }) {
    // business logic
    return { id: '...' };
  }
}

@Injectable(UserRepository)
class PrismaUserRepository implements UserRepository {
  async findByEmail(email: string) {
    // adapter logic
    return null;
  }
}

// withDecorators reads all @Injectable registrations and auto-binds them
const container = withDecorators(createContainer());
container.validate();

const hex = createHexApp({ container });
```

---

## How It Works

### Without decorators (beebear core today)

```
Developer writes:
  container.bind(RegisterUser, (c) => new RegisterUserService(c.resolve(UserRepository)))
  container.bind(UserRepository, () => new PrismaUserRepository())

Container stores:
  RegisterUser → factory function
  UserRepository → factory function

At resolve time:
  container.resolve(RegisterUser) → calls factory → new RegisterUserService(...)
```

### With decorators (this plugin)

```
At module load time:
  @Injectable(RegisterUser) on RegisterUserService
    → registers { token: RegisterUser, class: RegisterUserService } in global registry
  @Inject(UserRepository) on constructor param 0
    → stores { paramIndex: 0, token: UserRepository } as metadata on RegisterUserService

At withDecorators() time:
  Reads global registry
  For each entry:
    → reads @Inject metadata from constructor params
    → creates a factory: (c) => new Class(c.resolve(dep0), c.resolve(dep1), ...)
    → calls container.bind(token, factory, options) on the underlying container

At resolve time (same as core):
  container.resolve(RegisterUser) → calls factory → new RegisterUserService(...)
```

The key insight: decorators just automate what `container.bind()` does manually.
At runtime, the container works identically — same resolve, same lifecycles,
same validation, same scoping.

---

## Public API

### `@Injectable(token, options?)`

Class decorator. Registers the class in a global registry.

```ts
export function Injectable<T>(
  token: InjectionToken<T>,
  options?: { lifecycle?: 'singleton' | 'transient' | 'scoped' },
): ClassDecorator;
```

**What it does:**
1. Stores the class, its token, and lifecycle option in a module-level registry
2. Returns the class unchanged (no wrapping, no proxy)

**Examples:**

```ts
// Singleton (default)
@Injectable(RegisterUser)
class RegisterUserService { ... }

// Transient
@Injectable(RequestLogger, { lifecycle: 'transient' })
class RequestLoggerService { ... }

// Scoped
@Injectable(RequestContext, { lifecycle: 'scoped' })
class RequestContextService { ... }
```

### `@Inject(token)`

Parameter decorator. Marks a constructor parameter's dependency.

```ts
export function Inject<T>(
  token: InjectionToken<T>,
): ParameterDecorator;
```

**What it does:**
1. Stores `{ paramIndex, token }` as metadata on the class
2. Does NOT use `reflect-metadata` — uses a private Symbol key on the class

**Example:**

```ts
@Injectable(RegisterUser)
class RegisterUserService {
  constructor(
    @Inject(UserRepository) private repo: UserRepository,
    @Inject(EmailService) private mailer: EmailService,
  ) {}
}
// Metadata stored: param 0 → UserRepository, param 1 → EmailService
```

### `withDecorators(container)`

Wraps a beebear core container. Reads the global registry and auto-binds
all `@Injectable` classes.

```ts
export function withDecorators(container: Container): DecoratorContainer;
```

**What it does:**
1. Iterates the global registry
2. For each `@Injectable` class:
   - Reads `@Inject` metadata to get the dependency list
   - Creates a factory function: `(c) => new Class(c.resolve(dep0), ...)`
   - Calls `container.bind(token, factory, { lifecycle })` on the underlying container
3. Returns a `DecoratorContainer` (resolve/validate/createScope/has — no `bind`)

**DecoratorContainer interface:**

```ts
export interface DecoratorContainer {
  resolve<T>(token: InjectionToken<T>): T;
  has<T>(token: InjectionToken<T>): boolean;
  validate(): void;
  createScope(): DecoratorContainer;
}
```

No `bind()` method. This enforces mutual exclusivity — the developer can't
mix factory bindings with decorator bindings in the same container.

### `clearRegistry()`

Clears the global `@Injectable` registry. For testing only.

```ts
export function clearRegistry(): void;
```

---

## Metadata Storage

### No `reflect-metadata` required

The plugin does NOT require `reflect-metadata` or `emitDecoratorMetadata`.

`@Inject(token)` explicitly provides the token for each parameter. There's
no need for TypeScript to emit type metadata — the developer tells us
exactly what each parameter needs.

**Metadata is stored using a private Symbol key on the class:**

```ts
const INJECT_METADATA = Symbol('beebear:inject');
const INJECTABLE_METADATA = Symbol('beebear:injectable');

// @Inject stores an array of { paramIndex, token } on the class
// @Injectable stores { token, lifecycle } on the class
```

### tsconfig requirements

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

That's it. No `emitDecoratorMetadata`, no `reflect-metadata` import.

---

## Behavior Rules

1. **`@Injectable(token)` is required on every class that should be auto-bound.**
   Classes without `@Injectable` are invisible to `withDecorators()`.

2. **`@Inject(token)` is required on every constructor parameter.**
   If a parameter doesn't have `@Inject`, `withDecorators()` throws an error
   at bind time: `"Missing @Inject on parameter {index} of {className}"`.

3. **Classes with no constructor parameters don't need `@Inject`.**
   A class with an empty constructor (or no constructor) is valid — it has
   zero dependencies.

4. **`withDecorators()` binds everything at call time.**
   It reads the registry and binds immediately. Classes imported/decorated
   after `withDecorators()` is called are not included.

5. **Import order matters.**
   All `@Injectable` files must be imported before calling `withDecorators()`.
   This is the standard pattern for decorator-based DI (same as tsyringe).

6. **Duplicate tokens throw.**
   If two classes are `@Injectable` with the same token, `withDecorators()`
   throws: `"Duplicate @Injectable for token {tokenName}"`.

7. **Lifecycle defaults to `'singleton'`.**
   Same default as beebear core. Override via `@Injectable(token, { lifecycle: 'transient' })`.

8. **`DecoratorContainer` delegates to the underlying `Container`.**
   `resolve()`, `has()`, `validate()` all delegate to the wrapped container.
   `createScope()` returns a `DecoratorContainer` wrapping the scoped child.

9. **`clearRegistry()` resets the global registry.**
   Used in tests to prevent `@Injectable` registrations from leaking
   between test files. Should be called in `beforeEach` or `afterEach`.

10. **No property injection.**
    Only constructor injection via `@Inject`. No `@Inject` on class fields.

11. **No auto-token.**
    `@Injectable()` without a token is an error. The developer must explicitly
    provide the token. beebear tokens are symbols, not classes.

12. **Compatible with `createHexApp()`.**
    `DecoratorContainer` is accepted by `createHexApp({ container })`.
    The `HexAppOptions.container` type accepts both `Container` and
    `DecoratorContainer`.

---

## Error Cases

| Scenario | Error |
|---|---|
| `@Injectable()` without a token | `"@Injectable requires a token argument"` |
| Missing `@Inject` on a constructor param | `"Missing @Inject on parameter {index} of {className}"` |
| Duplicate `@Injectable` for same token | `"Duplicate @Injectable for token \"{tokenName}\""` |
| `resolve()` for unbound token | Same as core: `"No binding for \"{name}\""` |
| Circular dependency | Same as core: `"Circular dependency detected: A → B → A"` |

---

## Usage Examples

### Basic usage

```ts
import { Port, createContainer, createHexApp } from 'beebear';
import type { UseCase } from 'beebear';
import { Injectable, Inject, withDecorators } from '@beebear-plugins/di-decorators';

// Ports (same as always)
interface GetUser extends UseCase<{ id: string }, { name: string }> {}
const GetUser = Port<GetUser>('GetUser');

interface UserRepository {
  findById(id: string): Promise<{ name: string } | null>;
}
const UserRepository = Port<UserRepository>('UserRepository');

// Decorated implementations
@Injectable(UserRepository)
class InMemoryUserRepository implements UserRepository {
  async findById(id: string) {
    return { name: 'Alice' };
  }
}

@Injectable(GetUser)
class GetUserService implements GetUser {
  constructor(
    @Inject(UserRepository) private repo: UserRepository,
  ) {}

  async execute(input: { id: string }) {
    const user = await this.repo.findById(input.id);
    if (!user) throw new NotFoundError('User not found');
    return user;
  }
}

// Wire up
const container = withDecorators(createContainer());
container.validate();

const hex = createHexApp({ container, framework: 'express' });
```

### Testing with clearRegistry

```ts
import { clearRegistry, Injectable, Inject, withDecorators } from '@beebear-plugins/di-decorators';
import { createContainer } from 'beebear';

beforeEach(() => {
  clearRegistry();
});

it('resolves decorated classes', () => {
  @Injectable(MyToken)
  class MyService {
    getValue() { return 42; }
  }

  const container = withDecorators(createContainer());
  const service = container.resolve(MyToken);
  expect(service.getValue()).toBe(42);
});
```

### Transient lifecycle

```ts
@Injectable(RequestLogger, { lifecycle: 'transient' })
class ConsoleRequestLogger implements RequestLogger {
  private readonly id = crypto.randomUUID();

  log(message: string) {
    console.log(`[${this.id}] ${message}`);
  }
}

// Each resolve() returns a new instance
const a = container.resolve(RequestLogger);
const b = container.resolve(RequestLogger);
// a !== b (different instances, different ids)
```

---

## Non-Goals

- No `reflect-metadata` — explicit `@Inject(token)` on every param
- No `emitDecoratorMetadata` — not needed
- No property injection — constructor only
- No auto-token (class as its own token) — tokens are always symbols
- No TC39 decorators (stage 3) — uses `experimentalDecorators` for param decorator support
- No mixing factory and decorator bindings in one container
- No method injection
- No optional dependencies (`@Optional`)
- No multi-binding (multiple implementations for one token)
