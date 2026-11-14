# Spec: UseCase<TInput, TOutput> Contract

## Purpose

`UseCase<TInput, TOutput>` is the standard contract that all driving port
interfaces extend. It reduces boilerplate and enforces a consistent structure
across every use case in a beebear application.

Every driving port is defined as:

```ts
interface RegisterUser extends UseCase<RegisterUserInput, RegisterUserOutput> {}
const RegisterUser = Port<RegisterUser>('RegisterUser');
```

This is the **default and recommended pattern**. Developers don't write
`execute()` signatures manually — `UseCase<I, O>` provides that. This gives:

1. **Less boilerplate** — no need to spell out
   `execute(input: X): Promise<Y>` on every port interface.
2. **Consistent structure** — every port looks the same, every use case has
   the same shape. New team members read the code and immediately see the
   pattern.
3. **Refactor safety** — if the contract ever evolves, the change propagates
   through every port that extends `UseCase`.
4. **Framework type safety** — `hex.execute()` and `httpAdapter()` use
   `UseCase<TInput, TOutput>` as their generic constraint, enabling
   type-safe input/output inference.

Note: TypeScript's structural typing means a plain interface with a matching
`execute()` method also works technically, but all beebear docs, examples,
and CLI scaffolding use `extends UseCase<I, O>` as the standard approach.

---

## Public API

### `UseCase<TInput, TOutput>` (interface)

```ts
export interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
```

- `TInput` — the data the use case receives. Plain DTO (no framework types).
- `TOutput` — the data the use case returns. Plain DTO.
- `execute()` — always returns a `Promise`. Even if the implementation is
  synchronous, the contract is async. This avoids breaking changes when an
  implementation later needs to call an async driven port.

### Re-export

`UseCase` is exported from the main `beebear` entry point:

```ts
import type { UseCase } from 'beebear';
```

It's a **type-only export** — there is no runtime value. It's a pure
TypeScript interface.

---

## Behavior Rules

1. **Single contract method: `execute()`.**
   The interface requires exactly one method. No `run()`, no `handle()`,
   no `call()`. Just `execute()`. This consistency enables framework tooling
   (`hex.execute()`, `httpAdapter()`) to call use cases without knowing their
   concrete type. The implementing class is free to have additional private
   or protected helper methods — the interface only constrains the public
   contract, not the internal structure.

2. **Always async.**
   `execute()` returns `Promise<TOutput>`, never `TOutput` directly. This is
   a contract decision — even if a use case does no I/O today, it might
   tomorrow. Keeping the contract async avoids breaking changes.

3. **Input and output are plain types.**
   `TInput` and `TOutput` should be plain objects, primitives, or simple
   DTOs. No `Request`, no `Response`, no framework types. The use case lives
   inside the hexagon — it has no knowledge of HTTP, CLI, or any transport.

4. **Use cases implement driving ports.**
   The standard pattern:
   ```ts
   // Port definition (domain/ports/inbound/)
   interface RegisterUser extends UseCase<RegisterUserInput, RegisterUserOutput> {}
   const RegisterUser = Port<RegisterUser>('RegisterUser');

   // Use case implementation (domain/use-cases/)
   class RegisterUserService implements RegisterUser {
     async execute(input: RegisterUserInput): Promise<RegisterUserOutput> { ... }
   }
   ```
   The interface (driving port) extends `UseCase` to get the `execute()` contract.
   The class (use case) implements the business logic.

5. **Use cases depend on driven ports.**
   Use cases receive their dependencies (repositories, services) via
   constructor injection. They depend on port interfaces, never on concrete
   adapters.

6. **Errors are thrown, not returned.**
   Use cases throw business errors (`ValidationError`, `NotFoundError`, etc.)
   for failure cases. The framework catches these and maps them to HTTP
   status codes via `errorMap`. Result<T, E> pattern is also supported but
   optional — the default path is throw.

7. **`void` output is valid.**
   `UseCase<DeleteUserInput, void>` is valid for operations that don't
   return data. `execute()` still returns `Promise<void>`.

8. **No base class.**
   `UseCase` is an interface, not an abstract class. There's nothing to
   extend, nothing to `super()`. This keeps use cases as plain classes
   with zero framework inheritance.

---

## Type Constraints

- `TInput` can be any type: object, string, number, void, etc.
- `TOutput` can be any type: object, string, number, void, etc.
- Both `TInput` and `TOutput` are unconstrained generics — no `extends`
  clause. The developer decides what shape their input and output take.

```ts
// All valid:
UseCase<{ email: string; name: string }, { id: string }>
UseCase<string, boolean>
UseCase<void, User[]>
UseCase<DeleteInput, void>
```

---

## Usage Examples

### Basic use case

```ts
import type { UseCase } from 'beebear';
import { Port } from 'beebear';

interface GetUserInput { id: string }
interface GetUserOutput { id: string; email: string; name: string }

// Driving port — extends UseCase for the execute() contract
interface GetUser extends UseCase<GetUserInput, GetUserOutput> {}
const GetUser = Port<GetUser>('GetUser');

// Implementation — can have private helpers beyond execute()
class GetUserService implements GetUser {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(input: GetUserInput): Promise<GetUserOutput> {
    const user = await this.userRepo.findById(input.id);
    if (!user) throw new NotFoundError(`User ${input.id} not found`);
    return this.toOutput(user);
  }

  private toOutput(user: User): GetUserOutput {
    return { id: user.id, email: user.email, name: user.name };
  }
}
```

### Void output

```ts
interface DeleteUser extends UseCase<{ id: string }, void> {}
const DeleteUser = Port<DeleteUser>('DeleteUser');

class DeleteUserService implements DeleteUser {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(input: { id: string }): Promise<void> {
    await this.userRepo.delete(input.id);
  }
}
```

### Binding and resolving

```ts
container.bind(GetUser, GetUserService, [UserRepository]);
container.bind(DeleteUser, DeleteUserService, [UserRepository]);

const getUser = container.resolve(GetUser);
const result = await getUser.execute({ id: '123' });
```

---

## Relationship to CQRS

The `@beebear/cqrs` plugin defines `CommandHandler<TCommand, TResult>` and
`QueryHandler<TQuery, TResult>`. Both have the same `execute()` signature
as `UseCase<TInput, TOutput>`. This is intentional — migrating from plain
use cases to CQRS is a matter of changing the `implements` clause and the
token type, not rewriting the method.

```ts
// Before (core beebear)
class PlaceOrderService implements PlaceOrderUseCase {
  async execute(input: PlaceOrderInput): Promise<OrderId> { ... }
}

// After (CQRS plugin)
class PlaceOrderHandler implements CommandHandler<PlaceOrderCommand, OrderId> {
  async execute(command: PlaceOrderCommand): Promise<OrderId> { ... }
}
```

---

## Non-Goals

- No base class — `UseCase` is an interface only
- No `validate()` method — validation is the use case's responsibility
  internally, not a framework-enforced step
- No middleware/interceptor hooks on the interface — those live in
  `hex.execute()` and `httpAdapter()`
- No `Result<T, E>` in the core signature — the default is throw/catch.
  Result pattern support is opt-in and doesn't change the interface
- No input/output schema — validation libraries (Zod, Joi) are the
  developer's choice, applied at the boundary before the use case
