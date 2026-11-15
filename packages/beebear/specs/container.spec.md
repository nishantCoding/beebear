# Spec: DI Container

## Purpose

The DI container automates the composition root. Instead of manually
constructing every object and passing dependencies by hand, developers
register factories and the container resolves the dependency graph lazily.

beebear's container is:
- Token-based (uses `InjectionToken<T>` symbols from `Token<T>()` or `Port<T>()`)
- General-purpose (works in any architecture, not limited to hex arch)
- No decorators, no `reflect-metadata` (decorator support via optional plugin)
- Explicit factory functions (no auto-wiring magic)
- Singleton by default, transient and scoped opt-in
- Validates at startup (missing bindings, circular deps)

---

## Public API

### `createContainer(): Container`

Factory function that creates a new container instance.

```ts
import { createContainer } from 'beebear';

const container = createContainer();
```

### `container.bind<T>(token, factory, options?)`

Registers a factory for a token.

```ts
bind<T>(
  token: InjectionToken<T>,
  factory: (container: Container) => T,
  options?: BindOptions,
): void
```

- `token` — an `InjectionToken<T>` (created by `Token<T>()` or `Port<T>()`)
- `factory` — a function that creates the instance. Receives the container
  so it can resolve other dependencies.
- `options` — optional lifecycle configuration

```ts
interface BindOptions {
  lifecycle?: 'singleton' | 'transient' | 'scoped';
}
```

Default lifecycle is `'singleton'`.

#### Factory form (full control)

```ts
container.bind(UserRepository, (c) => new PrismaUserRepo(
  c.resolve(PrismaClient),
  c.resolve(Logger),
));
```

### `container.bind<T>(token, constructor, dependencies, options?)` — shorthand

Registers a class with its dependency tokens. The container resolves each
dependency and passes them to the constructor in order.

```ts
bind<T>(
  token: InjectionToken<T>,
  constructor: new (...args: any[]) => T,
  dependencies: InjectionToken<any>[],
  options?: BindOptions,
): void
```

#### Shorthand form (common case)

```ts
container.bind(RegisterUser, RegisterUserService, [UserRepository, EmailService]);

// Equivalent to:
container.bind(RegisterUser, (c) => new RegisterUserService(
  c.resolve(UserRepository),
  c.resolve(EmailService),
));
```

The shorthand covers the 90% case — a class that depends on other tokens.
The factory form remains available for edge cases (conditional logic, external
deps, computed arguments).

### `container.resolve<T>(token): T`

Resolves an instance for the given token.

```ts
resolve<T>(token: InjectionToken<T>): T
```

Behavior depends on lifecycle:
- **singleton** — creates on first resolve, returns cached instance on subsequent calls
- **transient** — creates a new instance every call
- **scoped** — creates one instance per scope (see `createScope`)

Throws if the token has no binding.

### `container.validate(): void`

Eagerly resolves all registered bindings to verify the dependency graph
is complete and acyclic. Should be called at startup before accepting requests.

```ts
validate(): void
```

Throws with a descriptive error if:
- A factory references a token that has no binding (missing dependency)
- The dependency graph contains a cycle (A → B → A)

After `validate()` succeeds, all singleton instances are created and cached.

### `container.createScope(): Container`

Creates a child container (scope) that inherits all bindings from the parent.

```ts
createScope(): Container
```

- Scoped bindings get a fresh instance per scope
- Singleton bindings are shared with the parent (not re-created)
- Transient bindings create new instances as usual
- New bindings on the child do not affect the parent

Typical use: one scope per HTTP request.

```ts
app.use((req, res, next) => {
  req.scope = container.createScope();
  next();
});
```

### `container.has(token): boolean`

Checks if a binding exists for the given token.

```ts
has<T>(token: InjectionToken<T>): boolean
```

Returns `true` if `bind()` was called with this token, `false` otherwise.
Does not resolve the factory.

---

## Behavior Rules

### Binding

1. **Bind registers a factory, does not call it.**
   The factory is only invoked when `resolve()` is called for that token.

2. **Rebinding replaces the previous factory.**
   Calling `bind()` twice with the same token overwrites the first.
   This enables test overrides:
   ```ts
   container.bind(UserRepository, (c) => new PrismaUserRepo(prisma));
   // In test setup:
   container.bind(UserRepository, (c) => new InMemoryUserRepo());
   ```

3. **Factory receives the container.**
   The factory's first argument is the container itself, so it can
   resolve other dependencies:
   ```ts
   container.bind(Foo, (c) => new Foo(c.resolve(Bar)));
   ```

4. **Shorthand resolves dependencies in order.**
   When using the shorthand form, the container resolves each token in
   the dependencies array and passes the results as constructor arguments
   in the same order:
   ```ts
   container.bind(Foo, FooImpl, [Bar, Baz]);
   // Calls: new FooImpl(resolved_Bar, resolved_Baz)
   ```

### Resolution

5. **Singleton is default lifecycle.**
   If no `options.lifecycle` is specified, the binding is singleton.
   First `resolve()` calls the factory, caches the result. Subsequent
   calls return the cached instance.

6. **Transient creates a new instance every time.**
   The factory is called on every `resolve()`. No caching.

7. **Scoped creates one instance per scope.**
   Within a scope (child container), the first `resolve()` creates and
   caches. Subsequent `resolve()` calls in the same scope return the
   cached instance. A different scope gets a different instance.

8. **Resolve throws on missing binding.**
   If `resolve()` is called with a token that was never bound, it throws:
   ```
   Error: No binding for "<name>"
   ```
   The error message includes the symbol's description.

9. **Resolve detects circular dependencies at resolution time.**
   If resolving token A triggers resolving token B which triggers
   resolving token A again, it throws:
   ```
   Error: Circular dependency detected: A → B → A
   ```

### Validation

10. **`validate()` eagerly resolves all bindings.**
    It iterates every registered token and calls `resolve()`. If any
    resolution fails (missing dep, circular dep), it throws immediately
    with a descriptive error.

11. **After `validate()`, all singletons are warm.**
    Since every factory was called, all singleton instances are now cached.
    No cold-start latency on first request.

### Scoping

12. **Child scope inherits parent bindings.**
    A scope created via `createScope()` can resolve any token bound on
    the parent. It does not copy factories — it delegates to the parent
    for tokens it doesn't own.

13. **Singletons are shared across scopes.**
    A singleton resolved in a child scope returns the same instance as
    the parent. Singletons live on the root container.

14. **Scoped bindings are isolated per scope.**
    Each scope gets its own instance for scoped bindings. Different
    scopes never share scoped instances.

15. **Child bindings don't affect the parent.**
    `scope.bind(token, factory)` only affects that scope. The parent
    and other scopes are unaffected.

### Type Safety

16. **`resolve()` infers the return type from the token.**
    ```ts
    const repo = container.resolve(UserRepository);
    // TypeScript infers: repo is UserRepository
    ```

17. **`bind()` enforces factory return type matches token type.**
    ```ts
    container.bind(UserRepository, (c) => new StripePayment());
    // TypeScript error: StripePayment is not assignable to UserRepository
    ```

18. **Shorthand enforces constructor return type matches token type.**
    ```ts
    container.bind(UserRepository, StripePayment, []);
    // TypeScript error: StripePayment is not assignable to UserRepository
    ```

---

## Error Messages

All errors thrown by the container should be clear and actionable:

| Situation | Error message pattern |
|-----------|----------------------|
| Resolve unbound token | `No binding for "<name>"` |
| Circular dependency | `Circular dependency detected: <path>` |
| Validation failure | `Container validation failed: No binding for "<name>"` |

`<name>` is the symbol's `.description` property (the string passed to
`Token()` or `Port()`).

---

## Non-Goals (core container)

- No auto-wiring (no scanning constructors to infer dependencies)
- No decorator support in core (`@Injectable`, `@Inject` — see plugin below)
- No async factories (factories are synchronous; async init happens outside)
- No named/tagged bindings (one token = one binding)
- No property injection (constructor injection only)
- No global/static container (always explicitly created and passed)

---

## Decorator Plugin (`@beebear-plugins/di-decorators`)

Decorator support is NOT part of core. It is a separate, optional plugin
that works with the same container.

```ts
// @beebear-plugins/di-decorators — optional plugin
import { Injectable, Inject } from '@beebear-plugins/di-decorators';

@Injectable()
class RegisterUserService {
  constructor(
    @Inject(UserRepository) private repo: UserRepository,
    @Inject(EmailService) private mailer: EmailService,
  ) {}
}
```

The plugin:
- Requires `reflect-metadata` and `experimentalDecorators` in tsconfig
- Works with the same `Container` instance and `InjectionToken<T>` tokens
- Is a separate package: `@beebear-plugins/di-decorators`

### Mutual Exclusivity (project-level, compile-time)

Factory-based DI and decorator-based DI are **mutually exclusive at the
project level**. A project uses one approach or the other, not both.

Enforced at **compile time** via TypeScript's type system — errors show
up as red squigglies in the IDE and fail on `tsc`.

**Two distinct container types:**

```ts
// Core — factory-based container
interface Container {
  bind<T>(token: InjectionToken<T>, factory: ...): void;
  resolve<T>(token: InjectionToken<T>): T;
  validate(): void;
  createScope(): Container;
  has<T>(token: InjectionToken<T>): boolean;
}

// Decorator plugin — no bind() method
interface DecoratorContainer {
  resolve<T>(token: InjectionToken<T>): T;
  validate(): void;
  createScope(): DecoratorContainer;
  has<T>(token: InjectionToken<T>): boolean;
  // bind() does not exist on this type
}
```

`withDecorators()` takes a `Container`, returns a `DecoratorContainer`:

```ts
import { createContainer } from 'beebear';
import { withDecorators } from '@beebear-plugins/di-decorators';

const container = withDecorators(createContainer());

container.bind(UserRepository, ...);
//        ^^^^ Compile-time error: Property 'bind' does not exist
//             on type 'DecoratorContainer'
```

The reverse is also safe — if the developer doesn't import `@beebear-plugins/di-decorators`,
`@Injectable()` and `@Inject()` simply don't exist. No way to use them.

**`createHexApp()` accepts one container:**

```ts
function createHexApp(config: {
  container: Container | DecoratorContainer;
  errorMap: Record<string, number>;
}): HexApp;
```

One app, one container, one approach. The developer picks factory or
decorator when they create the container. They can't mix both because
the types don't allow it.

If someone creates two separate containers (one factory, one decorator)
in different files, that's fine — but `createHexApp()` only takes one.
They must pick.

This is out of scope for the core container spec. Documented here only
to clarify the boundary.

---

## Usage Example

```ts
import { createContainer, Token, Port } from 'beebear';

// General-purpose tokens
const PrismaClient = Token<PrismaClient>('PrismaClient');
const Logger = Token<Logger>('Logger');

// Hex arch port tokens
interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
const UserRepository = Port<UserRepository>('UserRepository');

interface EmailService {
  sendWelcome(email: string): Promise<void>;
}
const EmailService = Port<EmailService>('EmailService');

interface RegisterUser {
  execute(input: { email: string; name: string }): Promise<{ id: string }>;
}
const RegisterUser = Port<RegisterUser>('RegisterUser');

// Container setup
const container = createContainer();

// Infrastructure (factory form — external deps)
container.bind(PrismaClient, () => new PrismaClient());
container.bind(Logger, () => new ConsoleLogger());

// Adapters (factory form — mix of container + external deps)
container.bind(UserRepository, (c) => new PrismaUserRepo(
  c.resolve(PrismaClient),
  c.resolve(Logger),
));
container.bind(EmailService, () => new SendgridEmailService(process.env.SENDGRID_KEY));

// Use cases (shorthand — all deps are tokens)
container.bind(RegisterUser, RegisterUserService, [UserRepository, EmailService]);

// Validate at startup
container.validate();

// Resolve when needed
const useCase = container.resolve(RegisterUser);
await useCase.execute({ email: 'ada@example.com', name: 'Ada' });
```
