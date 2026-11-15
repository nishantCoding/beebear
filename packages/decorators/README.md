# @beebear-plugins/di-decorators

Optional decorator-based DI for beebear. Use `@Injectable` and `@Inject` instead of manual `container.bind()` calls.

**No `reflect-metadata`. No `emitDecoratorMetadata`. Just `experimentalDecorators: true`.** Unlike most decorator DI libraries, `@Inject(token)` explicitly provides the dependency token — no need for TypeScript to emit type metadata.

## Install

```bash
npm install @beebear-plugins/di-decorators
```

Requires `beebear` as a peer dependency (`^0.2.0`).

## Quick Start

```ts
import { Port, createContainer, createHexApp } from 'beebear';
import type { UseCase } from 'beebear';
import { Injectable, Inject, withDecorators } from '@beebear-plugins/di-decorators';

// 1. Define ports (same as always)
interface UserRepository {
  findById(id: string): Promise<{ name: string } | null>;
}
const UserRepository = Port<UserRepository>('UserRepository');

interface GetUser extends UseCase<{ id: string }, { name: string }> {}
const GetUser = Port<GetUser>('GetUser');

// 2. Decorate implementations
@Injectable(UserRepository)
class PrismaUserRepository implements UserRepository {
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
    if (!user) throw new Error('User not found');
    return user;
  }
}

// 3. Wire up
const container = withDecorators(createContainer());
container.validate();

const hex = createHexApp({ container });
const result = await hex.execute(GetUser, { id: '1' });
```

## API

### `@Injectable(token, options?)`

Class decorator. Registers the class for auto-binding.

```ts
// Singleton (default)
@Injectable(UserRepository)
class PrismaUserRepository { ... }

// Transient — new instance every resolve
@Injectable(RequestLogger, { lifecycle: 'transient' })
class ConsoleRequestLogger { ... }

// Scoped — same within a scope, different across scopes
@Injectable(RequestContext, { lifecycle: 'scoped' })
class RequestContextImpl { ... }
```

Returns the class unchanged. No wrapping, no proxy.

### `@Inject(token)`

Parameter decorator. Marks a constructor parameter's dependency.

```ts
@Injectable(GetUser)
class GetUserService {
  constructor(
    @Inject(UserRepository) private repo: UserRepository,
    @Inject(EmailService) private mailer: EmailService,
  ) {}
}
```

Every constructor parameter must have `@Inject`. Classes with no constructor parameters don't need it.

### `withDecorators(container)`

Reads all `@Injectable` registrations and auto-binds them to the container. Returns a `DecoratorContainer`.

```ts
const container = withDecorators(createContainer());
```

All `@Injectable` files must be imported before calling `withDecorators()`. Decorations after this call are not included.

### `DecoratorContainer`

```ts
interface DecoratorContainer {
  resolve<T>(token: InjectionToken<T>): T;
  has<T>(token: InjectionToken<T>): boolean;
  validate(): void;
  createScope(): DecoratorContainer;
}
```

No `bind()` method — factory bindings and decorator bindings don't mix in one container.

### `clearRegistry()`

Clears the global `@Injectable` registry. Use in tests to prevent registrations from leaking between test files.

```ts
import { clearRegistry } from '@beebear-plugins/di-decorators';

beforeEach(() => {
  clearRegistry();
});
```

## Lifecycle

Same lifecycle options as beebear core:

```ts
// Singleton (default) — same instance every resolve
@Injectable(Logger)
class LoggerImpl { ... }

// Transient — new instance every resolve
@Injectable(Logger, { lifecycle: 'transient' })
class LoggerImpl { ... }

// Scoped — same within scope, different across scopes
@Injectable(Logger, { lifecycle: 'scoped' })
class LoggerImpl { ... }
```

## tsconfig

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

That's it. No `emitDecoratorMetadata`, no `reflect-metadata` import.

## Error Cases

| Scenario | Error Message |
|---|---|
| `@Injectable()` without a token | `@Injectable requires a token argument` |
| Missing `@Inject` on a constructor param | `Missing @Inject on parameter {index} of {className}` |
| Two classes with same token | `Duplicate @Injectable for token "{name}"` |
| `resolve()` for unbound token | `No binding for "{name}"` |
| Circular dependency | `Circular dependency detected: A → B → A` |

## Compatibility

`DecoratorContainer` works with `createHexApp()` and all beebear features — lifecycle hooks, error mapping, HTTP adapters (Express, Fastify, Hono).

```ts
const container = withDecorators(createContainer());
const hex = createHexApp({ container, framework: 'express' });

app.post('/users', hex.httpAdapter(RegisterUser, {
  toInput: (req) => req.body,
}));
```

## License

MIT
