# Dependency Injection Fundamentals

> What DI is, why it matters, and how it works — from scratch.
> No framework assumed. Plain TypeScript.

---

## 1. The Problem: Hard-Coded Dependencies

Consider this use case:

```ts
class RegisterUserService {
  async execute(input: { email: string; name: string }) {
    // Directly creating dependencies inside the class
    const pool = new Pool({ connectionString: 'postgres://...' });
    const repo = new PostgresUserRepository(pool);
    const mailer = new SendgridEmailService('sg-api-key-123');

    const existing = await repo.findByEmail(input.email);
    if (existing) throw new Error('User exists');

    const user = { id: randomUUID(), ...input };
    await repo.save(user);
    await mailer.sendWelcomeEmail(user.email, user.name);
    return user;
  }
}
```

**What's wrong here?**

1. **Can't test it.** Every test hits a real PostgreSQL database and sends a real email via Sendgrid. You can't swap in fakes.

2. **Can't change it.** Want to switch from Sendgrid to AWS SES? You edit the use case. Want to switch from Postgres to MongoDB? You edit the use case. The business logic is welded to specific technologies.

3. **Can't reuse it.** Another part of your app needs the same use case but with a different database connection? Too bad — the connection string is hard-coded inside.

4. **Secrets are scattered.** API keys and connection strings appear inside business logic instead of a central config.

---

## 2. The Fix: Pass Dependencies In (That's DI)

Dependency Injection is a simple idea: **instead of a class creating what it needs, it receives what it needs from the outside.**

```ts
class RegisterUserService {
  // Dependencies are RECEIVED, not created
  constructor(
    private repo: UserRepository,
    private mailer: EmailService,
  ) {}

  async execute(input: { email: string; name: string }) {
    const existing = await this.repo.findByEmail(input.email);
    if (existing) throw new Error('User exists');

    const user = { id: randomUUID(), ...input };
    await this.repo.save(user);
    await this.mailer.sendWelcomeEmail(user.email, user.name);
    return user;
  }
}
```

Now the class doesn't know or care what `repo` or `mailer` actually are.
It only knows the interface (port). The concrete implementation is someone
else's problem.

**That's it. That's dependency injection.** Passing things in instead of
creating them inside. Everything else is tooling to make this easier at scale.

---

## 3. Three Ways to Inject Dependencies

### A. Constructor Injection (most common, what we'll use)

Dependencies passed through the constructor:

```ts
const repo = new PostgresUserRepository(pool);
const mailer = new SendgridEmailService(apiKey);
const service = new RegisterUserService(repo, mailer);  // injected here
```

**Pros:** Dependencies are set once, available for the lifetime of the object, clearly visible in the constructor signature.

### B. Method Injection

Dependencies passed per method call:

```ts
class RegisterUserService {
  async execute(input, repo: UserRepository, mailer: EmailService) {
    // ...
  }
}

service.execute(input, repo, mailer);  // injected per call
```

**Pros:** Different dependencies per call. **Cons:** Messy signatures, caller needs to know all dependencies.

### C. Property/Setter Injection

Dependencies set after construction:

```ts
const service = new RegisterUserService();
service.repo = new PostgresUserRepository(pool);     // set after creation
service.mailer = new SendgridEmailService(apiKey);    // set after creation
```

**Pros:** Optional dependencies. **Cons:** Object can be used before dependencies are set. Dangerous.

**We use constructor injection.** It's the safest — the object can't exist without its dependencies. No half-initialized state.

---

## 4. Manual DI (The Composition Root)

Without any container or framework, you do DI manually:

```ts
// main.ts — the composition root

// 1. Create the "leaf" dependencies (things with no dependencies of their own)
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient();

// 2. Create driven adapters (depend on external libraries)
const userRepo = new PrismaUserRepository(prisma);
const emailService = new SendgridEmailService(process.env.SENDGRID_KEY);

// 3. Create use cases (depend on driven adapters)
const registerUser = new RegisterUserService(userRepo, emailService);
const deleteUser = new DeleteUserService(userRepo);
const getUser = new GetUserService(userRepo);

// 4. Create driving adapters (depend on use cases)
const userController = new UserController(registerUser, deleteUser, getUser);

// 5. Wire to HTTP
const app = express();
app.post('/users', userController.handleRegister);
app.delete('/users/:id', userController.handleDelete);
app.get('/users/:id', userController.handleGet);
app.listen(3000);
```

**This works.** For small apps, it's fine. But look at what happens as the app grows:

```ts
// 30 adapters, 50 use cases, 10 controllers...
const orderRepo = new PrismaOrderRepository(prisma);
const productRepo = new PrismaProductRepository(prisma);
const inventoryRepo = new PrismaInventoryRepository(prisma);
const paymentGateway = new StripePaymentGateway(process.env.STRIPE_KEY);
const notificationService = new TwilioNotificationService(process.env.TWILIO_KEY);
const auditLogger = new PostgresAuditLogger(pool);

const createOrder = new CreateOrderService(orderRepo, productRepo, inventoryRepo, paymentGateway, auditLogger);
const cancelOrder = new CancelOrderService(orderRepo, paymentGateway, notificationService, auditLogger);
const refundOrder = new RefundOrderService(orderRepo, paymentGateway, auditLogger);
const getOrder = new GetOrderService(orderRepo);
const listOrders = new ListOrdersService(orderRepo);
const updateInventory = new UpdateInventoryService(inventoryRepo, auditLogger);
const createProduct = new CreateProductService(productRepo, inventoryRepo, auditLogger);
// ... 40 more lines like this

const orderController = new OrderController(createOrder, cancelOrder, refundOrder, getOrder, listOrders);
const productController = new ProductController(createProduct, updateInventory);
// ... 8 more controllers
```

**Problems at scale:**
- 100+ lines of manual wiring
- Order matters — you must create dependencies before dependents
- Add a new dependency to a use case? Find every place it's constructed and update it
- Easy to make mistakes (wrong argument order, missing dependency)
- No way to know if you forgot to wire something until runtime

---

## 5. What a DI Container Does

A DI container automates the composition root. Instead of manually calling `new`,
you **register** how to create things, and the container **resolves** them on demand.

### The Simplest Possible Container

```ts
class Container {
  private factories = new Map<string, () => any>();
  private instances = new Map<string, any>();

  // Register: "when someone asks for 'X', here's how to create it"
  register(name: string, factory: () => any) {
    this.factories.set(name, factory);
  }

  // Resolve: "give me an instance of 'X'"
  resolve<T>(name: string): T {
    // Return existing instance if already created (singleton)
    if (this.instances.has(name)) {
      return this.instances.get(name);
    }

    // Create a new instance using the registered factory
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Nothing registered for "${name}"`);
    }

    const instance = factory();
    this.instances.set(name, instance);  // cache it
    return instance;
  }
}
```

**Usage:**

```ts
const container = new Container();

// Register factories (order doesn't matter!)
container.register('UserRepository', () => new PrismaUserRepository(prisma));
container.register('EmailService', () => new SendgridEmailService(apiKey));
container.register('RegisterUser', () => new RegisterUserService(
  container.resolve('UserRepository'),
  container.resolve('EmailService'),
));

// Resolve when needed — container builds the dependency graph
const registerUser = container.resolve<RegisterUserService>('RegisterUser');
```

**What changed:**
- Registration order doesn't matter (factories are lazy — called when resolved)
- Each thing is created exactly once (singleton by default)
- Adding a new dependency? Only update the factory, not every construction site

But this uses string keys, which have no type safety. That's why we need tokens.

---

## 6. Tokens: The Bridge Between Types and Runtime

TypeScript interfaces don't exist at runtime:

```ts
interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
}

// At runtime, "UserRepository" is gone. JavaScript has no idea it existed.
// A container can't use it as a lookup key.
```

A **token** is a runtime value that represents a type. Three approaches:

### Approach A: String tokens

```ts
container.register('UserRepository', () => new PrismaUserRepository(prisma));
const repo = container.resolve<UserRepository>('UserRepository');
```

**Problem:** The string `'UserRepository'` and the type `UserRepository` can drift.
Typo in the string? Runtime error. No compiler help.

### Approach B: Symbol tokens

```ts
const USER_REPO = Symbol('UserRepository');
container.register(USER_REPO, () => new PrismaUserRepository(prisma));
const repo = container.resolve<UserRepository>(USER_REPO);
```

**Better:** Symbols are unique, no accidental collision. But still no link between
the symbol and the TypeScript type. You could accidentally resolve the wrong type.

### Approach C: Typed tokens with declaration merging (what beebear uses)

```ts
// Port<T> creates a symbol token that carries type information
interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
const UserRepository = Port<UserRepository>('UserRepository');

// Now UserRepository is BOTH:
// - A TypeScript type (the interface)
// - A runtime value (the token/symbol)

container.bind(UserRepository, () => new PrismaUserRepository(prisma));
const repo = container.resolve(UserRepository);
// TypeScript knows `repo` is UserRepository — no manual type annotation needed
```

**How `Port<T>` works internally:**

```ts
// A branded symbol that carries type information
type PortToken<T> = symbol & { __type?: T };

function Port<T>(name: string): PortToken<T> {
  return Symbol(name) as PortToken<T>;
}
```

The `__type` property never exists at runtime — it's a phantom type. But TypeScript
uses it to infer the correct return type from `container.resolve()`.

**Declaration merging** is what lets the same name be both a type and a value:

```ts
// TypeScript sees TWO declarations with the same name:
interface UserRepository { ... }         // 1. type declaration
const UserRepository = Port<...>(...);   // 2. value declaration

// It merges them. Now "UserRepository" can be used as:
// - A type: function foo(repo: UserRepository) { ... }
// - A value: container.resolve(UserRepository)
```

This isn't a hack — it's an official TypeScript feature. Classes work the same way
(the class name is both a type and a constructor value).

---

## 7. Lifecycle: Singleton vs. Transient vs. Scoped

When the container creates an instance, how long does it live?

### Singleton (one instance forever)

```ts
container.bind(UserRepository, () => new PrismaUserRepository(prisma), { lifecycle: 'singleton' });

const a = container.resolve(UserRepository);
const b = container.resolve(UserRepository);
// a === b → true (same instance)
```

**Use for:** Database connections, repository adapters, stateless services.
Most things in a hex arch app are singletons.

### Transient (new instance every time)

```ts
container.bind(SomeService, () => new SomeService(), { lifecycle: 'transient' });

const a = container.resolve(SomeService);
const b = container.resolve(SomeService);
// a === b → false (different instances)
```

**Use for:** Stateful objects that shouldn't be shared, per-operation contexts.

### Scoped (one instance per scope/request)

```ts
// Create a child scope per HTTP request
app.use((req, res, next) => {
  req.scope = container.createScope();
  next();
});

// Within one request, same instance. Across requests, different instances.
container.bind(RequestLogger, () => new RequestLogger(), { lifecycle: 'scoped' });
```

**Use for:** Per-request state (current user, request logger, transaction context).

### beebear Default

**Singleton by default.** In hex arch, most things (repos, services, use cases) are
stateless and should be created once. Transient and scoped are opt-in.

---

## 8. How the Container Resolves Dependencies

When you call `container.resolve(RegisterUser)`, here's what happens:

```
resolve(RegisterUser)
    │
    ├─ Is there a cached instance? → Yes → return it
    │
    └─ No → call the factory function
              │
              factory = () => new RegisterUserService(
              │   container.resolve(UserRepository),   ← recursive resolve
              │   container.resolve(EmailService),     ← recursive resolve
              │ )
              │
              ├─ resolve(UserRepository)
              │   └─ factory = () => new PrismaUserRepository(prisma)
              │   └─ creates instance, caches it, returns it
              │
              ├─ resolve(EmailService)
              │   └─ factory = () => new SendgridEmailService(key)
              │   └─ creates instance, caches it, returns it
              │
              └─ creates RegisterUserService with both deps, caches it, returns it
```

The container walks the dependency tree lazily. It only creates what's needed,
when it's needed, and caches the result.

---

## 9. Validation: Catching Mistakes at Startup

A good container validates at startup, not at first request:

### Missing Binding

```ts
container.bind(RegisterUser, () => new RegisterUserService(
  container.resolve(UserRepository),   // UserRepository was never bound!
  container.resolve(EmailService),
));

container.validate();
// Error: No binding for port "UserRepository"
// Thrown at startup, not at the first HTTP request 5 minutes later
```

### Circular Dependencies

```ts
container.bind(A, () => new A(container.resolve(B)));
container.bind(B, () => new B(container.resolve(A)));  // A → B → A → infinite loop

container.validate();
// Error: Circular dependency detected: A → B → A
```

### How Validation Works

```ts
validate() {
  // For every registered factory, try to resolve it (dry run)
  // If any resolve fails, throw immediately with a clear error
  for (const [token, factory] of this.factories) {
    try {
      this.resolve(token);
    } catch (error) {
      throw new Error(`Failed to resolve "${token.description}": ${error.message}`);
    }
  }
}
```

This is called in `createHexApp()` so the app won't start if wiring is broken.

---

## 10. Full Example: Manual DI vs. Container DI

### Before (manual composition root — 20 lines for 5 use cases)

```ts
const prisma = new PrismaClient();
const userRepo = new PrismaUserRepository(prisma);
const orderRepo = new PrismaOrderRepository(prisma);
const emailService = new SendgridEmailService(process.env.SENDGRID_KEY);
const paymentService = new StripePaymentService(process.env.STRIPE_KEY);

const registerUser = new RegisterUserService(userRepo, emailService);
const getUser = new GetUserService(userRepo);
const createOrder = new CreateOrderService(orderRepo, userRepo, paymentService);
const cancelOrder = new CancelOrderService(orderRepo, paymentService, emailService);
const getOrder = new GetOrderService(orderRepo);

const userController = new UserController(registerUser, getUser);
const orderController = new OrderController(createOrder, cancelOrder, getOrder);
```

### After (container — same 5 use cases, but scales better)

```ts
import { createContainer, Port } from 'beebear';

const container = createContainer();

// Bind ports → adapters
container.bind(UserRepository, () => new PrismaUserRepository(new PrismaClient()));
container.bind(OrderRepository, () => new PrismaOrderRepository(container.resolve(PrismaClient)));
container.bind(EmailService, () => new SendgridEmailService(process.env.SENDGRID_KEY));
container.bind(PaymentService, () => new StripePaymentService(process.env.STRIPE_KEY));

// Bind use cases (dependencies auto-resolved)
container.bind(RegisterUser, () => new RegisterUserService(
  container.resolve(UserRepository),
  container.resolve(EmailService),
));
container.bind(GetUser, () => new GetUserService(
  container.resolve(UserRepository),
));
container.bind(CreateOrder, () => new CreateOrderService(
  container.resolve(OrderRepository),
  container.resolve(UserRepository),
  container.resolve(PaymentService),
));
container.bind(CancelOrder, () => new CancelOrderService(
  container.resolve(OrderRepository),
  container.resolve(PaymentService),
  container.resolve(EmailService),
));
container.bind(GetOrder, () => new GetOrderService(
  container.resolve(OrderRepository),
));

// Validate everything at startup
container.validate();
```

**Why the container version is better at scale:**
- Add a dependency to `CreateOrderService`? Update ONE factory, not every construction site
- Forgot to bind `EmailService`? `container.validate()` catches it at startup
- Need a different adapter in test? `container.bind(UserRepository, () => new InMemoryUserRepository())`
- Order of `bind()` calls doesn't matter — factories are lazy

---

## 11. DI Without Decorators (Why beebear Avoids Them)

Many DI frameworks (NestJS, tsyringe, InversifyJS) use decorators:

```ts
// NestJS style — requires decorators + reflect-metadata
@Injectable()
class RegisterUserService {
  constructor(
    @Inject(UserRepository) private repo: UserRepository,
    @Inject(EmailService) private mailer: EmailService,
  ) {}
}
```

**Why we avoid this:**

1. **`experimentalDecorators` + `emitDecoratorMetadata`** must be enabled in tsconfig. These are non-standard TypeScript features that may change or be replaced.

2. **`reflect-metadata` polyfill** is required at runtime. An extra dependency that patches global prototypes.

3. **Magic.** The container "magically" knows what to inject by reading metadata at runtime. When it breaks, debugging is painful — you're fighting reflection, not your code.

4. **Coupling.** Your domain classes now import from the DI framework (`@Injectable`, `@Inject`). In hex arch, the domain should have ZERO framework dependencies.

**beebear's approach: explicit factories.**

```ts
// No decorators. No metadata. No magic.
// The factory explicitly says what goes where.
container.bind(RegisterUser, () => new RegisterUserService(
  container.resolve(UserRepository),   // explicit: first param = UserRepository
  container.resolve(EmailService),     // explicit: second param = EmailService
));
```

Slightly more typing than decorators. But:
- Zero magic — you can read exactly what happens
- Zero framework imports in domain code
- Zero special tsconfig settings
- Works with any TypeScript setup, including strict mode

---

## Summary

| Concept | What It Means |
|---------|--------------|
| Dependency Injection | Pass dependencies in, don't create them inside |
| Constructor Injection | Pass dependencies through the constructor |
| Composition Root | The one place where everything is wired together |
| DI Container | Automates the composition root with register + resolve |
| Token | A runtime value representing a type (since TS types erase) |
| Port token | beebear's typed token: interface + `Port<T>()` declaration merging |
| Singleton | One instance, reused everywhere (default in beebear) |
| Transient | New instance every resolve |
| Scoped | One instance per scope (e.g., per HTTP request) |
| Validation | Catch missing/circular bindings at startup, not at runtime |
| Factory | A function that creates an instance: `() => new Foo(deps...)` |
