# Complete Example: Hex Arch Without a Framework

> A full working example of hexagonal architecture in plain TypeScript.
> This is what developers do TODAY without beebear. Our framework will reduce this boilerplate.

---

## The App: User Registration

Features:
- Register a user with email + name
- Email must be valid, name must not be empty
- No duplicate emails
- Send a welcome email after registration

---

## Project Structure

```
src/
├── domain/
│   ├── models/
│   │   └── User.ts                    # Domain entity
│   ├── ports/
│   │   ├── inbound/
│   │   │   └── RegisterUser.ts        # Driving port (use case interface)
│   │   └── outbound/
│   │       ├── UserRepository.ts      # Driven port (persistence)
│   │       └── EmailService.ts        # Driven port (notifications)
│   ├── use-cases/
│   │   └── RegisterUserService.ts     # Use case implementation
│   └── errors/
│       └── index.ts                   # Domain errors
│
├── infrastructure/
│   ├── persistence/
│   │   ├── PrismaUserRepository.ts    # Driven adapter (production)
│   │   └── InMemoryUserRepository.ts  # Driven adapter (testing)
│   ├── email/
│   │   ├── SendgridEmailService.ts    # Driven adapter (production)
│   │   └── FakeEmailService.ts        # Driven adapter (testing)
│   └── http/
│       └── UserController.ts          # Driving adapter
│
├── main.ts                            # Composition root
└── test/
    └── register-user.test.ts          # Unit test
```

---

## Step 1: Domain Errors

```ts
// src/domain/errors/index.ts

export class DomainError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT');
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 'NOT_FOUND');
  }
}
```

---

## Step 2: Domain Entity

```ts
// src/domain/models/User.ts

import { randomUUID } from 'crypto';
import { ValidationError } from '../errors';

export class User {
  private constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly name: string,
    public readonly createdAt: Date,
  ) {}

  /**
   * Factory method for creating a NEW user.
   * Business rules are enforced here.
   */
  static register(email: string, name: string): User {
    if (!email || !email.includes('@')) {
      throw new ValidationError(`Invalid email: ${email}`);
    }
    if (!name || name.trim().length === 0) {
      throw new ValidationError('Name must not be empty');
    }

    return new User(
      randomUUID(),
      email.toLowerCase().trim(),
      name.trim(),
      new Date(),
    );
  }

  /**
   * Factory method for reconstituting an EXISTING user from storage.
   * No validation — we trust data that's already persisted.
   */
  static reconstitute(id: string, email: string, name: string, createdAt: Date): User {
    return new User(id, email, name, createdAt);
  }
}
```

---

## Step 3: Driven Ports (What the App Needs)

```ts
// src/domain/ports/outbound/UserRepository.ts

import { Port } from 'beebear';
import { User } from '../../models/User';

// DRIVEN PORT: The application needs someone to store and retrieve users.
// Interface = the type contract. Port() = the runtime DI token.
export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
export const UserRepository = Port<UserRepository>('UserRepository');
```

```ts
// src/domain/ports/outbound/EmailService.ts

import { Port } from 'beebear';

export interface EmailService {
  sendWelcomeEmail(to: string, name: string): Promise<void>;
}
export const EmailService = Port<EmailService>('EmailService');
```

---

## Step 4: Driving Port (What the App Can Do)

```ts
// src/domain/ports/inbound/RegisterUser.ts

import { Port } from 'beebear';

// Input and output are plain DTOs — no HTTP, no framework types.
export interface RegisterUserInput {
  email: string;
  name: string;
}

export interface RegisterUserOutput {
  id: string;
  email: string;
}

// DRIVING PORT: The outside world can ask the app to register a user.
export interface RegisterUser {
  execute(input: RegisterUserInput): Promise<RegisterUserOutput>;
}
export const RegisterUser = Port<RegisterUser>('RegisterUser');
```

---

## Step 5: Use Case (Implements Driving Port, Depends on Driven Ports)

```ts
// src/domain/use-cases/RegisterUserService.ts

import { User } from '../models/User';
import { ConflictError } from '../errors';
import { RegisterUser, RegisterUserInput, RegisterUserOutput } from '../ports/inbound/RegisterUser';
import { UserRepository } from '../ports/outbound/UserRepository';
import { EmailService } from '../ports/outbound/EmailService';

export class RegisterUserService implements RegisterUser {
  constructor(
    private readonly userRepo: UserRepository,      // driven port
    private readonly emailService: EmailService,     // driven port
  ) {}

  async execute(input: RegisterUserInput): Promise<RegisterUserOutput> {
    // 1. Check uniqueness (driven port call)
    const existing = await this.userRepo.findByEmail(input.email);
    if (existing) {
      throw new ConflictError(`User with email ${input.email} already exists`);
    }

    // 2. Create domain entity (business rules enforced in User.register)
    const user = User.register(input.email, input.name);

    // 3. Persist (driven port call)
    await this.userRepo.save(user);

    // 4. Side effect (driven port call)
    await this.emailService.sendWelcomeEmail(user.email, user.name);

    // 5. Return plain output
    return { id: user.id, email: user.email };
  }
}
```

**Notice what this file imports:**
- `User` — domain model ✓
- `ConflictError` — domain error ✓
- `RegisterUser` — domain port ✓
- `UserRepository` — domain port ✓
- `EmailService` — domain port ✓

**What it does NOT import:**
- Express ✗
- Prisma ✗
- Sendgrid ✗
- Any npm package from infrastructure ✗

---

## Step 6: Driven Adapters (Infrastructure Implementations)

### Production: Prisma

```ts
// src/infrastructure/persistence/PrismaUserRepository.ts

import { PrismaClient } from '@prisma/client';
import { UserRepository } from '../../domain/ports/outbound/UserRepository';
import { User } from '../../domain/models/User';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    if (!row) return null;
    return User.reconstitute(row.id, row.email, row.name, row.createdAt);
  }

  async save(user: User): Promise<void> {
    await this.prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
    });
  }
}
```

### Production: Sendgrid

```ts
// src/infrastructure/email/SendgridEmailService.ts

import sgMail from '@sendgrid/mail';
import { EmailService } from '../../domain/ports/outbound/EmailService';

export class SendgridEmailService implements EmailService {
  constructor(apiKey: string) {
    sgMail.setApiKey(apiKey);
  }

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    await sgMail.send({
      to,
      from: 'noreply@myapp.com',
      subject: `Welcome, ${name}!`,
      text: `Hi ${name}, thanks for signing up.`,
    });
  }
}
```

### Testing: In-Memory Fakes

```ts
// src/infrastructure/persistence/InMemoryUserRepository.ts

import { UserRepository } from '../../domain/ports/outbound/UserRepository';
import { User } from '../../domain/models/User';

export class InMemoryUserRepository implements UserRepository {
  private store = new Map<string, User>();

  async findByEmail(email: string): Promise<User | null> {
    return this.store.get(email.toLowerCase()) ?? null;
  }

  async save(user: User): Promise<void> {
    this.store.set(user.email, user);
  }

  // Test helper — not part of the port interface
  getAll(): User[] {
    return Array.from(this.store.values());
  }
}
```

```ts
// src/infrastructure/email/FakeEmailService.ts

import { EmailService } from '../../domain/ports/outbound/EmailService';

export class FakeEmailService implements EmailService {
  public sentEmails: Array<{ to: string; name: string }> = [];

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    this.sentEmails.push({ to, name });
  }
}
```

---

## Step 7: Driving Adapter (HTTP Controller)

```ts
// src/infrastructure/http/UserController.ts

import { Request, Response, NextFunction } from 'express';
import { RegisterUser } from '../../domain/ports/inbound/RegisterUser';
import { DomainError } from '../../domain/errors';

export class UserController {
  constructor(private readonly registerUser: RegisterUser) {}

  handleRegister = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.registerUser.execute({
        email: req.body.email,
        name: req.body.name,
      });
      res.status(201).json(result);
    } catch (error) {
      // THIS is the repetitive error mapping beebear will automate
      if (error instanceof DomainError) {
        const statusMap: Record<string, number> = {
          VALIDATION_ERROR: 400,
          NOT_FOUND: 404,
          CONFLICT: 409,
        };
        const status = statusMap[error.code] ?? 500;
        res.status(status).json({ error: error.message, code: error.code });
      } else {
        next(error);
      }
    }
  };
}
```

---

## Step 8: Composition Root

```ts
// src/main.ts

import express from 'express';
import { PrismaClient } from '@prisma/client';

// Adapters
import { PrismaUserRepository } from './infrastructure/persistence/PrismaUserRepository';
import { SendgridEmailService } from './infrastructure/email/SendgridEmailService';
import { UserController } from './infrastructure/http/UserController';

// Use Cases
import { RegisterUserService } from './domain/use-cases/RegisterUserService';

// --- COMPOSITION ROOT: wire everything together ---

// Driven adapters (what the app needs)
const prisma = new PrismaClient();
const userRepo = new PrismaUserRepository(prisma);
const emailService = new SendgridEmailService(process.env.SENDGRID_API_KEY!);

// Use cases (inject driven adapters)
const registerUser = new RegisterUserService(userRepo, emailService);

// Driving adapters (inject use cases)
const userController = new UserController(registerUser);

// HTTP server
const app = express();
app.use(express.json());
app.post('/users', userController.handleRegister);
app.listen(3000, () => console.log('Server running on port 3000'));
```

---

## Step 9: Unit Test

```ts
// src/test/register-user.test.ts

import { RegisterUserService } from '../domain/use-cases/RegisterUserService';
import { InMemoryUserRepository } from '../infrastructure/persistence/InMemoryUserRepository';
import { FakeEmailService } from '../infrastructure/email/FakeEmailService';
import { ConflictError, ValidationError } from '../domain/errors';

describe('RegisterUser', () => {
  let userRepo: InMemoryUserRepository;
  let emailService: FakeEmailService;
  let registerUser: RegisterUserService;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    emailService = new FakeEmailService();
    registerUser = new RegisterUserService(userRepo, emailService);
  });

  it('registers a new user and sends welcome email', async () => {
    const result = await registerUser.execute({
      email: 'Ada@Example.com',
      name: 'Ada Lovelace',
    });

    expect(result.id).toBeDefined();
    expect(result.email).toBe('ada@example.com'); // normalized

    // Verify persistence
    const saved = await userRepo.findByEmail('ada@example.com');
    expect(saved).not.toBeNull();
    expect(saved!.name).toBe('Ada Lovelace');

    // Verify side effect
    expect(emailService.sentEmails).toHaveLength(1);
    expect(emailService.sentEmails[0].to).toBe('ada@example.com');
  });

  it('rejects duplicate email', async () => {
    await registerUser.execute({ email: 'ada@example.com', name: 'Ada' });

    await expect(
      registerUser.execute({ email: 'ada@example.com', name: 'Other' })
    ).rejects.toThrow(ConflictError);
  });

  it('rejects invalid email', async () => {
    await expect(
      registerUser.execute({ email: 'not-an-email', name: 'Ada' })
    ).rejects.toThrow(ValidationError);
  });

  it('rejects empty name', async () => {
    await expect(
      registerUser.execute({ email: 'ada@example.com', name: '' })
    ).rejects.toThrow(ValidationError);
  });
});
```

**Notice:** Zero infrastructure. No HTTP server. No database. Pure logic testing.

---

## What beebear Will Automate From This Example

| What the developer writes today | What beebear handles |
|------|------|
| Port interfaces | Still writes these (it's their domain) |
| Domain entities | Still writes these (it's their domain) |
| Use case classes | Still writes these, but with a standard `UseCase<I, O>` contract |
| Adapter classes | Still writes these (it's their infra) |
| Composition root (`main.ts`) | **beebear DI container auto-resolves** |
| Error mapping in controllers | **beebear error middleware auto-maps** |
| Test setup boilerplate | **beebear test utilities auto-wire fakes** |
| Folder structure | **beebear CLI scaffolds it** |
| In-memory fake adapters | **beebear can auto-generate basic fakes from port interfaces** (stretch goal) |
