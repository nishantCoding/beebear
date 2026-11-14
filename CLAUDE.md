# beebear — Hexagonal Architecture Framework for Node.js/TypeScript

## What This Is

A lightweight, decorator-free framework that provides the plumbing for hexagonal
architecture (ports and adapters). Developers focus on domain logic and adapter
implementations; beebear handles DI, error mapping, use case execution, and
transport abstraction.

Public npm package. MIT license. Monorepo.

## Development Approach — MUST FOLLOW

CRITICAL: This project uses Spec-Driven Development (SDD). You MUST follow
this sequence for EVERY component. NEVER skip steps or combine them.

### SDD Workflow (strictly enforced)

For each component in the build order:

1. **SPEC ONLY** → Write the spec document (`packages/<pkg>/specs/<name>.spec.md`).
   Define public API, types, behavior rules, edge cases, non-goals.
   Then STOP. Do NOT write any code. Wait for user review and approval.

2. **TESTS ONLY** → After user approves the spec, write tests against the spec.
   Then STOP. Do NOT write implementation. Wait for user review and approval.

3. **IMPLEMENT** → After user approves the tests, write the implementation
   to pass the tests. Run tests to validate.

4. **VALIDATE** → Verify the implementation matches the spec exactly.
   Run typecheck, tests, build.

Do NOT write tests before the spec is approved by the user.
Do NOT write implementation before the tests are approved by the user.
Do NOT combine multiple steps into one. Each step requires a STOP and user review.
Do NOT assume approval. Wait for explicit user confirmation before proceeding.

No code without a spec. No implementation without approved tests.

## Design Decisions (Settled)

These decisions were made during brainstorming and are final unless explicitly revisited:

### Ports
- Ports are **standard TypeScript interfaces** (not abstract classes)
- Each port has a co-located runtime token via `Port<T>()` using declaration merging
- `Port<T>(name)` returns a branded symbol (`PortToken<T>`) that serves as both
  the DI lookup key and carries phantom type info for type-safe resolution
- Ports are owned by the domain (defined inside the hexagon)

### Dependency Injection
- **No decorators.** No `reflect-metadata`. No `emitDecoratorMetadata`.
- Token-based DI container with explicit factory functions
- `container.bind(token, factory)` / `container.resolve(token)`
- **Singleton by default.** Transient and scoped are opt-in.
- Startup validation: missing bindings and circular dependencies caught before
  the app starts, not at first request
- Inspired by tsyringe's token concept but without any decorator requirement

### Use Cases
- Class-based as default pattern: `class Foo implements UseCase<TInput, TOutput>`
- Use cases implement driving ports, depend on driven ports
- Use cases live inside the hexagon, have zero framework/infra imports

### Error Handling
- Framework ships base error classes: `BusinessError`, `ValidationError`,
  `NotFoundError`, `ConflictError`, `UnauthorizedError`, `ForbiddenError`
- Error-to-HTTP-status mapping is global (defined once in `createHexApp`)
- Both throw and Result patterns supported in use cases

### Transport Abstraction (`httpAdapter`)
- **Strategy pattern** for HTTP framework support (Express, Fastify, Hono)
- beebear ships built-in strategies for Express, Fastify, and Hono
- Developer passes a string: `createHexApp({ framework: 'express' })`
- For niche frameworks, developer passes a custom `FrameworkStrategy` object
- No auto-detection — explicit string or object, zero ambiguity
- Strategy resolved ONCE at startup, permanently assigned — no branching at request time
- Each strategy implements `FrameworkStrategy.createHandler(executeRoute, options)`
- Built-in strategies use `any` types — zero runtime framework imports
- Express, Fastify, Hono declared as optional `peerDependencies`
- `hex.execute()` exists as a framework-agnostic fallback
- `httpAdapter` receives `toInput` (always required) and optional `status` code

### Payload Validation
- Structural/payload validation (Zod, Joi, etc.) happens in middleware BEFORE `httpAdapter`
- It's a boundary concern — the developer's middleware, not the framework's
- Business rule validation stays inside use cases

### Observability
- Not part of the framework. Developer's concern.
- beebear provides lifecycle hooks: `beforeExecute`, `afterExecute`, `onError`
- Developer plugs in their own logging/tracing/metrics stack

### What beebear Does NOT Provide
- HTTP server (developer chooses Express/Fastify/Hono)
- Database client (developer chooses Prisma/Drizzle/Mongoose)
- Authentication / authorization
- Validation library (developer brings Zod/Joi/etc.)
- DDD patterns (optional via `@beebear/ddd` plugin)
- CQRS, event sourcing, sagas (optional plugins)
- WebSockets, SSE, gRPC adapters (developer writes these as driving adapters)

## Project Structure (beebear apps)

This is the structure beebear's CLI scaffolds for end users:

```
src/
├── domain/
│   ├── models/              # Domain objects (plain TS, no framework imports)
│   ├── ports/
│   │   ├── inbound/         # Driving ports (use case interfaces + tokens)
│   │   └── outbound/        # Driven ports (repo/service interfaces + tokens)
│   ├── use-cases/           # Use case implementations
│   └── errors/              # Business error classes
└── infrastructure/
    ├── persistence/         # Driven adapters (Prisma, Mongo, in-memory)
    ├── http/                # Driving adapters (controllers/routes)
    └── services/            # Driven adapters (email, payment, etc.)
```

## Package Structure (monorepo)

```
packages/
├── beebear/                 # Core: Port<T>, container, errors, UseCase, httpAdapter, createHexApp
├── @beebear/cli/            # CLI scaffolder: new, generate port/use-case/adapter
├── @beebear/testing/        # Test container, adapter overrides, helpers
├── @beebear/ddd/            # Optional: Entity, ValueObject, AggregateRoot, DomainEvent
├── @beebear/cqrs/           # Optional: CommandHandler, QueryHandler, buses, command/query split
└── @beebear/mcp/            # MCP server for AI coding assistants
```

Core `beebear` has zero runtime dependencies. Plugins depend on core but
core never depends on plugins.

## Build Order (SDD)

Phase 1 — Core (`beebear`):
1. `Port<T>()` token factory
2. DI Container (bind, resolve, validate, lifecycles)
3. Business error base classes
4. `UseCase<TInput, TOutput>` contract
5. `hex.execute()` — framework-agnostic use case runner
6. `FrameworkStrategy` + built-in strategies + `httpAdapter()`
7. `createHexApp()` — ties everything together
8. Lifecycle hooks (beforeExecute, afterExecute, onError)

Phase 2 — CLI (`@beebear/cli`)
Phase 3 — Testing utilities (`@beebear/testing`)
Phase 4 — DDD plugin (`@beebear/ddd`)
Phase 5 — MCP server (`@beebear/mcp`)

## Code Style

- TypeScript strict mode
- No decorators, no reflect-metadata
- No unnecessary abstractions — three similar lines > premature abstraction
- Explicit over magic — factories over auto-wiring
- Minimal runtime dependencies in core (target: zero)

## Reference Notes

Detailed design notes and educational material are in `notes/`:
- `01-hexagonal-architecture-fundamentals.md`
- `02-what-beebear-framework-solves.md`
- `03-complete-example-without-framework.md`
- `04-httpAdapter-design.md`
- `05-dependency-injection-fundamentals.md`
- `06-ddd-basics-and-where-logic-lives.md`
- `07-roadmap-and-approach.md`
- `08-cqrs-plugin-design.md`
