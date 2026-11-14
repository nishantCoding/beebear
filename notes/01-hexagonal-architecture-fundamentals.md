# Hexagonal Architecture Fundamentals

> Based on Alistair Cockburn's original "Ports and Adapters" pattern (2005).
> Source: https://alistair.cockburn.us/hexagonal-architecture/

---

## 1. The Problem It Solves

In most Node.js apps (Express, Fastify), you see code like this:

```ts
app.post('/users', async (req, res) => {
  const { email, name } = req.body;
  if (!email.includes('@')) return res.status(400).json({ error: 'Invalid email' });
  const existing = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  if (existing.rows.length) return res.status(409).json({ error: 'Already exists' });
  const result = await db.query('INSERT INTO users ...', [email, name]);
  res.status(201).json(result.rows[0]);
});
```

**Three things are tangled together:**
1. HTTP handling (req/res, status codes)
2. Business rules (email validation, uniqueness check)
3. Database access (SQL queries)

**Consequences:**
- You can't test business rules without spinning up an HTTP server and a database.
- You can't switch from Express to Fastify without rewriting business logic.
- You can't switch from PostgreSQL to MongoDB without touching route handlers.
- You can't run the same logic from a CLI command or a message queue consumer.

Hexagonal architecture fixes this by drawing a hard boundary: **business logic on the inside, everything else on the outside.**

---

## 2. The Core Idea: Inside vs. Outside

Forget "layers" (controller → service → repository). Hexagonal architecture is not top-down. It's **inside-out**.

```
                    ┌─────────────────────────────┐
                    │         OUTSIDE WORLD        │
                    │                               │
                    │  ┌─────────┐   ┌──────────┐  │
                    │  │  HTTP   │   │ Database  │  │
                    │  │ Server  │   │ (Postgres)│  │
                    │  └────┬────┘   └─────┬─────┘  │
                    │       │              │         │
                    │  ─────┼──────────────┼─────── │
                    │       │   BOUNDARY   │         │
                    │  ─────┼──────────────┼─────── │
                    │       │              │         │
                    │       ▼              ▲         │
                    │  ┌─────────────────────────┐  │
                    │  │     APPLICATION CORE     │  │
                    │  │                           │  │
                    │  │  • Domain Entities        │  │
                    │  │  • Business Rules         │  │
                    │  │  • Use Cases              │  │
                    │  │  • Port Interfaces        │  │
                    │  │                           │  │
                    │  └─────────────────────────┘  │
                    │                               │
                    └─────────────────────────────┘
```

**The rule:** The inside knows NOTHING about the outside. It doesn't know Express exists. It doesn't know PostgreSQL exists. It only knows about its own interfaces (ports).

---

## 3. Ports

A **port** is an interface that defines a conversation between the inside and the outside.

Cockburn's definition: *"A port identifies a purposeful conversation. There will typically be multiple adapters for any one port, for various technologies that may plug into that port."*

### Two Kinds of Ports

#### Driving Ports (Primary / Inbound)

These define **what the application can do**. The outside world calls INTO the application through these.

Think of it as the application's API — its menu of operations.

```ts
// This is a DRIVING PORT
// It says: "I, the application, can register users"
interface RegisterUser {
  execute(command: { email: string; name: string }): Promise<{ id: string }>;
}
```

**Who calls driving ports?** HTTP controllers, CLI commands, test suites, message queue consumers, gRPC handlers, cron jobs — anything that wants to trigger the application.

#### Driven Ports (Secondary / Outbound)

These define **what the application needs from the outside world**. The application calls OUT through these.

Think of it as the application saying: "I need someone to store users for me, but I don't care how."

```ts
// This is a DRIVEN PORT
// It says: "I, the application, need someone to persist and retrieve users"
interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
```

**Who implements driven ports?** PostgreSQL adapters, MongoDB adapters, in-memory fakes for tests, Redis caches, external API clients.

### Key Insight: Ports Are Owned by the Inside

This is crucial. The `UserRepository` interface is NOT defined by the database layer. It's defined by the **application core**. The application dictates what it needs; the outside world conforms.

```
WRONG:  Database layer defines the interface → Application depends on it
RIGHT:  Application defines the interface → Database adapter implements it
```

This is the **Dependency Inversion Principle** in action.

### Ports in beebear: Interface + Token

Standard TypeScript interfaces are the idiomatic way to define ports. But interfaces
are erased at runtime — a DI container can't look them up. beebear solves this with
a co-located runtime token using declaration merging:

```ts
import { Port } from 'beebear';

// Normal interface — exactly what developers are used to
export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

// One extra line — creates a runtime token with the same name
export const UserRepository = Port<UserRepository>('UserRepository');
```

Now `UserRepository` works as both:
- A **type** (for type-checking in constructors, implements clauses)
- A **value** (for DI container registration and resolution)

This is the only framework-specific concept in port definitions. Everything else
is standard TypeScript.

---

## 4. Adapters

An **adapter** is a concrete implementation that plugs into a port. It translates between the application's language and a specific technology.

### Driving Adapters (Primary / Inbound)

These **drive** the application. They receive external input and translate it into a port call.

```ts
// DRIVING ADAPTER: translates HTTP → port call
class UserController {
  constructor(private registerUser: RegisterUser) {}

  async handlePost(req: Request, res: Response) {
    // Translate HTTP request → domain command
    const command = { email: req.body.email, name: req.body.name };

    // Call the port
    const result = await this.registerUser.execute(command);

    // Translate domain result → HTTP response
    res.status(201).json(result);
  }
}
```

The controller knows about Express (`req`, `res`). But the `RegisterUser` port does not. The controller is the translator.

### Driven Adapters (Secondary / Outbound)

These **are driven by** the application. The application calls them through port interfaces.

```ts
// DRIVEN ADAPTER: implements the port using PostgreSQL
class PostgresUserRepository implements UserRepository {
  constructor(private pool: Pool) {}

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE email = $1', [email]
    );
    if (result.rows.length === 0) return null;
    return User.fromRow(result.rows[0]); // Map DB row → Domain entity
  }

  async save(user: User): Promise<void> {
    await this.pool.query(
      'INSERT INTO users (id, email, name) VALUES ($1, $2, $3)',
      [user.id, user.email, user.name]
    );
  }
}
```

### Multiple Adapters Per Port

The same port can have many adapters. This is the power of the pattern:

```
UserRepository (port)
  ├── PostgresUserRepository    (production)
  ├── MongoUserRepository       (alternative production)
  ├── InMemoryUserRepository    (unit tests)
  └── FakeUserRepository        (integration tests with seeded data)
```

You swap them at startup. The application core never changes.

---

## 5. The Application Core (The Hexagon)

The inside contains two things that hexagonal architecture itself prescribes:

### Use Cases (Application Services)
These orchestrate application logic. They implement driving ports and depend on driven ports:

```ts
class RegisterUserService implements RegisterUser {
  constructor(private users: UserRepository) {}  // driven port injected

  async execute(command: { email: string; name: string }): Promise<{ id: string }> {
    const existing = await this.users.findByEmail(command.email);
    if (existing) {
      throw new UserAlreadyExistsError(command.email);
    }

    const id = generateId();
    await this.users.save({ id, email: command.email, name: command.name });

    return { id };
  }
}
```

Notice:
- It implements `RegisterUser` (driving port) — so the outside can trigger it
- It depends on `UserRepository` (driven port interface) — NOT on Postgres/Mongo
- It contains NO HTTP concepts, NO SQL, NO framework imports

### Port Interfaces
As shown above — the interfaces that define the boundaries.

### What About Entities, Value Objects, Aggregates?

Those are **Domain-Driven Design (DDD)** concepts, NOT hexagonal architecture concepts.
Cockburn's original definition explicitly says the hexagon is *"deliberately agnostic
about what's inside."* It doesn't prescribe how you model your domain.

You CAN use DDD inside the hexagon — many teams do. But you can also use:
- Plain objects and functions
- Simple classes without DDD patterns
- Functional programming style
- Any approach that works for your domain

**Hexagonal architecture only cares about the boundary** (ports, adapters, inside vs.
outside). What happens inside is your choice.

---

## 6. The Composition Root

This is where everything gets wired together. It lives OUTSIDE the hexagon. It's the only place that knows about all the concrete implementations.

```ts
// main.ts — THE COMPOSITION ROOT
import { Pool } from 'pg';
import express from 'express';

// Domain (inside)
import { RegisterUserService } from './domain/use-cases/RegisterUserService';

// Adapters (outside)
import { PostgresUserRepository } from './infrastructure/persistence/PostgresUserRepository';
import { UserController } from './infrastructure/http/UserController';

// --- Wire everything ---

// 1. Create driven adapters (things the app NEEDS)
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const userRepository = new PostgresUserRepository(pool);

// 2. Create use cases, injecting driven adapters
const registerUser = new RegisterUserService(userRepository);

// 3. Create driving adapters, injecting use cases
const userController = new UserController(registerUser);

// 4. Start the driving infrastructure
const app = express();
app.use(express.json());
app.post('/users', userController.handlePost);
app.listen(3000);
```

**This is what our framework will automate.** In a real app with 50 use cases and 20 ports, this file becomes a nightmare. That's where a DI container helps.

---

## 7. The Dependency Rule (Visualized)

All source code dependencies point INWARD:

```
  Driving Adapter ───depends on───▶ Driving Port (interface)
  (HTTP Controller)                  (RegisterUser)
                                          │
                                    implemented by
                                          │
                                          ▼
                                     Use Case
                                (RegisterUserService)
                                          │
                                    depends on
                                          │
                                          ▼
                                    Driven Port (interface)
                                    (UserRepository)
                                          ▲
                                    implemented by
                                          │
                                    Driven Adapter
                               (PostgresUserRepository)
```

**Reading the arrows:**
- HTTP Controller → depends on → RegisterUser interface (points inward) ✓
- RegisterUserService → implements → RegisterUser interface (inside the hexagon) ✓
- RegisterUserService → depends on → UserRepository interface (inside the hexagon) ✓
- PostgresUserRepository → implements → UserRepository interface (points inward) ✓

**Nothing inside points outward.** The domain never imports from `infrastructure/`.

---

## 8. Testing: The Killer Feature

This is the #1 practical benefit. You test business logic with NO infrastructure:

```ts
describe('RegisterUserService', () => {
  it('registers a new user', async () => {
    // Use a fake driven adapter — no database needed
    const repo = new InMemoryUserRepository();
    const service = new RegisterUserService(repo);

    const result = await service.execute({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    });

    expect(result.id).toBeDefined();
    const saved = await repo.findByEmail('ada@example.com');
    expect(saved).not.toBeNull();
    expect(saved!.name).toBe('Ada Lovelace');
  });

  it('rejects duplicate emails', async () => {
    const repo = new InMemoryUserRepository();
    const service = new RegisterUserService(repo);

    await service.execute({ email: 'ada@example.com', name: 'Ada' });

    await expect(
      service.execute({ email: 'ada@example.com', name: 'Other Ada' })
    ).rejects.toThrow(UserAlreadyExistsError);
  });
});
```

No Express. No PostgreSQL. No Docker. No test database setup. Runs in milliseconds.

The `InMemoryUserRepository` is a simple fake:

```ts
class InMemoryUserRepository implements UserRepository {
  private store = new Map<string, User>();

  async findByEmail(email: string): Promise<User | null> {
    return this.store.get(email.toLowerCase()) ?? null;
  }

  async save(user: User): Promise<void> {
    this.store.set(user.email, user);
  }
}
```

---

## 9. How Many Ports Should You Have?

Cockburn observed 2-4 ports in real systems. Don't overthink it. Group by **purpose of conversation**, not by technology:

- "For persisting and retrieving orders" → `OrderRepository` port
- "For sending notifications" → `NotificationSender` port
- "For processing payments" → `PaymentProcessor` port
- "For user-triggered operations" → various use case (driving) ports

**Rule of thumb:** If two operations talk to the same external system for the same purpose, they share a port. If they talk to the same system for different purposes (e.g., Redis for caching AND Redis for pub/sub), they get separate ports.

---

## 10. Common Mistakes

### Mistake 1: Domain imports infrastructure
```ts
// WRONG — domain entity importing from Prisma
import { PrismaClient } from '@prisma/client';

class UserService {
  constructor(private prisma: PrismaClient) {} // direct dependency on Prisma
}
```

### Mistake 2: Putting ports outside the domain
```ts
// WRONG — repository interface defined in the infrastructure layer
// infrastructure/repositories/IUserRepository.ts

// RIGHT — repository interface defined in the domain layer
// domain/ports/UserRepository.ts
```

### Mistake 3: Anemic ports (leaking technology)
```ts
// WRONG — port leaks SQL concepts
interface UserRepository {
  query(sql: string, params: any[]): Promise<any>;  // This is a database, not a port
}

// RIGHT — port speaks domain language
interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
```

### Mistake 4: Application logic in adapters
```ts
// WRONG — business decision made in the HTTP controller
class UserController {
  async handlePost(req, res) {
    // This is a domain rule — the controller is deciding WHO can register
    if (req.body.email.endsWith('@competitor.com')) {
      return res.status(403).json({ error: 'Blocked domain' });
    }
    // Discount logic in the controller — this is business logic
    const price = req.body.isVip ? product.price * 0.8 : product.price;
    // ...
  }
}

// RIGHT — all decisions inside the hexagon (use case or domain)
class RegisterUserService {
  async execute(input) {
    if (isBlockedDomain(input.email)) {
      throw new BlockedDomainError(input.email);
    }
    // ...
  }
}
```

Note: simple input validation ("is email non-empty?", "does it contain @?") is a
**boundary concern**, not business logic. It can live at the port boundary (DTO
validation) before the use case runs. The rule is: if a decision requires **domain
knowledge**, it belongs inside the hexagon.

---

## Summary Table

| Concept | What It Is | Who Defines It | Who Implements It |
|---------|-----------|----------------|-------------------|
| Domain Entity | Business object with rules | Domain | Domain |
| Driving Port | "What the app can do" | Domain | Use Case |
| Driven Port | "What the app needs" | Domain | Infrastructure Adapter |
| Driving Adapter | Entry point (HTTP, CLI) | Infrastructure | Infrastructure |
| Driven Adapter | External system wrapper | Infrastructure | Infrastructure |
| Use Case | Orchestrates business logic | Domain | Domain |
| Composition Root | Wires everything together | Infrastructure | Infrastructure |

---

## Next: How Our Framework Helps

The manual hexagonal approach works but has pain points:
1. **Boilerplate** — every use case needs the same structure
2. **Wiring** — composition root grows unmanageable
3. **Validation** — no standard place for input validation
4. **Error mapping** — translating domain errors to HTTP/gRPC responses is repetitive
5. **No enforcement** — nothing stops a developer from importing Prisma in the domain

Our framework (`beebear`) will solve these. See the next note for framework design.
