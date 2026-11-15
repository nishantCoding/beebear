export const OVERVIEW = `# beebear — Hexagonal Architecture Framework

## What is beebear?

beebear is a lightweight, **decorator-free** framework that provides the plumbing for
hexagonal architecture (ports and adapters) in Node.js/TypeScript. It has **zero runtime
dependencies**. Developers focus on domain logic and adapter implementations; beebear
handles dependency injection, error mapping, use case execution, and transport abstraction.

## Core Concepts

### Hexagonal Architecture
The application is split into an inner hexagon (domain logic) and outer adapters
(infrastructure). The domain defines **ports** (interfaces) that adapters implement.
Dependencies always point inward — the domain never imports infrastructure code.

### Ports
Ports are standard TypeScript interfaces with co-located runtime tokens created via
\`Port<T>(name)\`. Ports live inside the domain. There are two kinds:
- **Inbound (driving) ports** — use case interfaces that the outside world calls in
- **Outbound (driven) ports** — repository/service interfaces the domain depends on

### Adapters
Adapters live in infrastructure and implement port interfaces:
- **Driving adapters** — HTTP controllers, CLI handlers, message consumers
- **Driven adapters** — database repositories, email services, payment gateways

### Use Cases
Class-based by default. A use case implements a driving port and depends on driven ports.
Use cases live inside the hexagon and have zero framework imports.

### DI Container
Token-based, no decorators, no \`reflect-metadata\`. Explicit factory functions.
Singleton by default with transient and scoped opt-in. Startup validation catches
missing bindings before the app starts.

## What beebear Handles vs What You Handle

**beebear provides:**
- \`Port<T>()\` / \`Token<T>()\` — typed DI tokens
- \`createContainer()\` — DI container with bind/resolve/validate
- \`createHexApp()\` — ties container, error mapping, HTTP adapters, and hooks together
- Error base classes with automatic HTTP status mapping
- Transport abstraction via \`httpAdapter()\` (Express, Fastify, Hono)
- Lifecycle hooks: \`beforeExecute\`, \`afterExecute\`, \`onError\`

**You provide:**
- HTTP server (Express, Fastify, Hono)
- Database client (Prisma, Drizzle, Mongoose)
- Validation library (Zod, Joi, etc.) — used in middleware before routes
- Authentication / authorization
- Logging, tracing, metrics (plug into lifecycle hooks)

## Plugin Ecosystem

- **@beebear-plugins/di-decorators** — Opt-in decorator-based DI (\`@Injectable\`, \`@Inject\`).
  Requires only \`experimentalDecorators: true\` in tsconfig (no \`reflect-metadata\`).
- **@beebear-plugins/ddd** — Domain-Driven Design building blocks: \`ValueObject\`,
  \`Entity\`, \`AggregateRoot\`, \`DomainEvent\`. Zero dependencies, standalone.
`;
