# What the beebear Framework Solves

> This note explains the gap between "knowing hex architecture" and "doing it at scale",
> and what our framework automates.

---

## The Pain Points of Manual Hexagonal Architecture

### Pain 1: The Composition Root Explodes

With 3 use cases, manual wiring is fine:

```ts
const userRepo = new PostgresUserRepository(pool);
const createUser = new CreateUserService(userRepo);
const deleteUser = new DeleteUserService(userRepo);
const getUser = new GetUserService(userRepo);
```

With 50 use cases across 10 modules, each with 2-3 dependencies, the composition root
becomes 200+ lines of manual `new X(y, z)` calls. Order matters. Missing a dependency
is a runtime error, not a compile error.

**beebear solves this:** Token-based DI container auto-resolves the dependency graph.

---

### Pain 2: Every Use Case Has the Same Shape

Every use case looks like this:

```ts
class SomeUseCase implements SomePort {
  constructor(private dep1: Port1, private dep2: Port2) {}
  async execute(input: SomeInput): Promise<SomeOutput> {
    // validate → business logic → call driven ports → return
  }
}
```

You repeat this structure 50 times. The framework provides a standard base/contract.

**beebear solves this:** Standardized `UseCase<TInput, TOutput>` contract with optional
built-in input validation.

---

### Pain 3: Error Translation is Repetitive

Every driving adapter needs to catch domain errors and translate them:

```ts
// You write this in EVERY controller method
try {
  const result = await this.useCase.execute(input);
  res.status(201).json(result);
} catch (error) {
  if (error instanceof NotFoundError) res.status(404).json({ ... });
  else if (error instanceof ValidationError) res.status(422).json({ ... });
  else if (error instanceof ConflictError) res.status(409).json({ ... });
  else res.status(500).json({ ... });
}
```

**beebear solves this:** Error mapping is built into the driving adapter layer. You throw
domain errors; the framework translates them to the correct transport response.

---

### Pain 4: No Compile-Time Safety for Wiring

TypeScript interfaces erase at runtime. So there's no way to catch this at startup:

```ts
// Developer forgot to register a UserRepository adapter
// App starts fine... then crashes when the first request hits the use case
```

**beebear solves this:** The container validates at startup that every registered port
has exactly one adapter bound. Missing adapter = app won't start + clear error message.

---

### Pain 5: Testing Setup is Boilerplate

For every test, you manually construct fakes and wire them:

```ts
const fakeRepo = new InMemoryUserRepository();
const fakeNotifier = new FakeEmailNotifier();
const useCase = new CreateUserService(fakeRepo, fakeNotifier);
```

**beebear solves this:** Test utilities let you create a container with auto-swapped
in-memory adapters or selective overrides.

---

### Pain 6: No Enforcement of the Dependency Rule

Nothing in plain TypeScript stops this:

```ts
// domain/use-cases/CreateUser.ts
import { PrismaClient } from '@prisma/client';  // VIOLATION — domain importing infrastructure
```

**beebear solves this:** (Stretch goal) Lint rules or build-time checks that flag
imports crossing the boundary.

---

## How External Packages Fit In (Your Question)

You asked: if we don't ship database/HTTP adapters, how do developers use Prisma, Express, etc.?

**Answer: Developers write thin adapter classes that wrap external packages.**

The framework does NOT know about Prisma or Express. Developers bring their own. Here's how:

### Example: Using Prisma

```ts
// Developer installs Prisma in their project (npm install prisma @prisma/client)
// Developer writes an adapter that implements the port:

// infrastructure/persistence/PrismaUserRepository.ts
import { PrismaClient } from '@prisma/client';          // External package
import { UserRepository } from '../../domain/ports/UserRepository';  // Port from domain
import { User } from '../../domain/models/User';                     // Domain entity

const prisma = new PrismaClient();

export class PrismaUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { email } });
    if (!row) return null;
    return User.reconstitute(row.id, row.email, row.name);  // Map Prisma model → Domain entity
  }

  async save(user: User): Promise<void> {
    await prisma.user.create({
      data: { id: user.id, email: user.email, name: user.name },
    });
  }
}
```

### Example: Using Mongoose

```ts
// infrastructure/persistence/MongoUserRepository.ts
import mongoose from 'mongoose';
import { UserRepository } from '../../domain/ports/UserRepository';
import { User } from '../../domain/models/User';

const UserModel = mongoose.model('User', new mongoose.Schema({
  email: String,
  name: String,
}));

export class MongoUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const doc = await UserModel.findOne({ email });
    if (!doc) return null;
    return User.reconstitute(doc._id.toString(), doc.email!, doc.name!);
  }

  async save(user: User): Promise<void> {
    await UserModel.create({ _id: user.id, email: user.email, name: user.name });
  }
}
```

### Example: Using Express as Driving Adapter

```ts
// infrastructure/http/ExpressUserRoutes.ts
import { Router } from 'express';
import { RegisterUser } from '../../domain/ports/RegisterUser';

export function createUserRoutes(registerUser: RegisterUser): Router {
  const router = Router();

  router.post('/users', async (req, res, next) => {
    const result = await registerUser.execute({
      email: req.body.email,
      name: req.body.name,
    });
    res.status(201).json(result);
    // Error handling is done by beebear's middleware (auto domain→HTTP mapping)
  });

  return router;
}
```

### What beebear Provides for This

The framework provides:

1. **Base error classes** — `DomainError`, `NotFoundError`, `ValidationError`, etc.
2. **Error-mapping middleware** — wrap Express/Fastify so domain errors auto-translate to HTTP status codes
3. **The DI container** — so developers register their adapter and the framework wires it

```ts
// What the developer's composition root looks like WITH beebear:
import { createContainer } from 'beebear';
import { UserRepository } from './domain/ports/outbound/UserRepository';   // interface + token
import { EmailService } from './domain/ports/outbound/EmailService';       // interface + token
import { RegisterUser } from './domain/ports/inbound/RegisterUser';        // interface + token

const container = createContainer();

// Bind port tokens → adapter implementations
container.bind(UserRepository, () => new PrismaUserRepository(prisma));
container.bind(EmailService, () => new SendgridEmailService(apiKey));
container.bind(RegisterUser, () => new RegisterUserService(
  container.resolve(UserRepository),    // type-safe: returns UserRepository
  container.resolve(EmailService),      // type-safe: returns EmailService
));

// Driving adapter setup — developer still chooses Express/Fastify/Hono
const express = require('express');
const server = express();
server.use(express.json());
server.use(container.errorMiddleware());  // beebear provides this
server.post('/users', userController.handleRegister);
server.listen(3000);
```

**Key principle:** beebear handles the INSIDE plumbing (DI, use case orchestration, error
handling, validation). The OUTSIDE (which HTTP framework, which ORM) is the developer's choice.
We provide glue, not implementations.

---

## Framework vs. Library Spectrum

Where beebear sits:

```
Express (library)          NestJS (framework)           beebear (opinionated library)
"here's routing"          "do it my way or leave"       "here's hex arch plumbing,
                                                         bring your own infra"
No structure              Forces module/controller       Enforces inside/outside boundary
                          /service/decorator pattern     but not technology choices
```

We're closer to a "structured library" than a "full framework". We provide:
- The DI container
- The use case contract/runner
- The error handling pipeline
- The CLI scaffolder for project structure
- Testing utilities

We do NOT provide:
- An HTTP server (use Express/Fastify/Hono)
- A database client (use Prisma/Drizzle/Mongoose)
- An authentication system
- A specific validation library (but we integrate with Zod)
- DDD patterns (Entity, Value Object, Aggregate, Domain Events) — these are optional
  via a separate `@beebear/ddd` plugin for teams that want them

---

## What the Developer Gets

### Without beebear (manual hex arch):
- Write all interfaces manually ✓ (still do this — it's your domain)
- Write all adapters manually ✓ (still do this — it's your infra)
- Write a massive composition root manually ✗ → beebear DI handles this
- Write error mapping in every route ✗ → beebear error middleware handles this
- Write test setup boilerplate ✗ → beebear test utilities handle this
- Remember the folder structure ✗ → beebear CLI scaffolds it
- Hope nobody violates the dependency rule ✗ → beebear can lint/validate this

### With beebear:
Developers focus on two things:
1. **Domain logic** (entities, use cases, port interfaces)
2. **Adapter implementations** (how to talk to their specific database/API)

Everything else is handled.
