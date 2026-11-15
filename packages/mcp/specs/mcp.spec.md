# Spec: `@beebear-plugins/mcp` — MCP Server for AI Coding Assistants

## The Problem

When an AI coding assistant (Claude Code, Cursor, Copilot) is asked to write
beebear code, it doesn't know the framework. It might:

- Use decorators (beebear is decorator-free)
- Skip the Port<T>() token pattern (use plain interfaces without tokens)
- Put business logic in adapters instead of use cases
- Forget to bind dependencies in the container
- Use the wrong error classes or miss error mapping
- Not know about httpAdapter, resolveStatus, or lifecycle hooks

The developer ends up correcting the AI or writing the code themselves —
defeating the purpose of AI assistance.

## The Solution

An MCP server that the AI assistant connects to. It provides:

1. **Resources** — Framework documentation the AI reads to understand beebear
2. **Tools** — Scaffolding functions the AI calls to generate correct code
3. **Prompts** — Guided workflows for common tasks

The developer adds one config entry, and their AI assistant instantly knows
how to write idiomatic beebear code.

```json
{
  "mcpServers": {
    "beebear": {
      "command": "npx",
      "args": ["-y", "@beebear-plugins/mcp"]
    }
  }
}
```

---

## Resources

Resources are read-only markdown documents the AI consumes for context.
They're the most important part — they teach the AI how beebear works.

### `beebear://docs/overview`

What beebear is, what it provides, what it doesn't. Core concepts:
hexagonal architecture, ports, adapters, use cases, DI container.

Content covers:
- Framework philosophy (lightweight, decorator-free by default, zero runtime deps)
- The hexagonal architecture model (domain inside, infra outside)
- Core building blocks: Port<T>, UseCase, Container, createHexApp
- What beebear handles vs what the developer handles

### `beebear://docs/api`

Complete public API reference. Every exported symbol with its type signature:

- `Port<T>(name)` / `Token<T>(name)` — token factories
- `createContainer()` — DI container with bind/resolve/validate
- `createHexApp(options)` — app factory with execute/httpAdapter
- Error classes — BusinessError, ValidationError, NotFoundError, etc.
- `UseCase<TInput, TOutput>` — use case contract
- Types — ExecuteResult, HexAppOptions, HookContext, HexAppHooks, etc.

### `beebear://docs/patterns`

The 6 key patterns every beebear app uses, with full code examples:

1. **Port definition** — Interface + Port<T>() token (inbound and outbound)
2. **Use case implementation** — Class implementing UseCase, depends on driven ports
3. **Adapter implementation** — Class implementing an outbound port
4. **Container binding** — Factory functions, resolve dependencies, validate at startup
5. **HTTP routes** — httpAdapter with toInput, method-based status defaults, overrides
6. **Lifecycle hooks** — beforeExecute/afterExecute/onError, HookContext, state

### `beebear://docs/project-structure`

Standard folder layout for beebear apps:

```
src/
├── domain/
│   ├── models/
│   ├── ports/
│   │   ├── inbound/      # Driving ports (use case interfaces + tokens)
│   │   └── outbound/     # Driven ports (repo/service interfaces + tokens)
│   ├── use-cases/
│   └── errors/
└── infrastructure/
    ├── persistence/       # Driven adapters (DB implementations)
    ├── http/              # Driving adapters (routes)
    └── services/          # Driven adapters (email, payment, etc.)
```

Plus: where the composition root goes, where the hex app is created,
where routes are registered.

### `beebear://docs/errors`

Error class hierarchy, when to use each, HTTP status mappings:

- BusinessError (400) — generic business logic failure
- ValidationError (400) — input validation failure
- NotFoundError (404) — entity not found
- ConflictError (409) — state conflict
- UnauthorizedError (401) — not authenticated
- ForbiddenError (403) — not authorized

Plus: creating custom error subclasses, overriding status codes via errorMap.

### `beebear://docs/http-adapters`

HTTP framework integration:

- Built-in strategies: Express, Fastify, Hono
- httpAdapter usage: toInput, status override
- Method-based defaults: POST→201, DELETE→204, else→200
- Custom FrameworkStrategy for niche frameworks
- How httpAdapter calls hex.execute() internally (hooks fire automatically)

### `beebear://docs/decorators`

Optional decorator-based DI via `@beebear-plugins/di-decorators`:

- When to use: teams that prefer decorator style (NestJS/tsyringe background)
- Install: `npm install @beebear-plugins/di-decorators`
- tsconfig: only `experimentalDecorators: true` — no `reflect-metadata`, no `emitDecoratorMetadata`
- `@Injectable(token, options?)` — registers a class for auto-binding
- `@Inject(token)` — marks constructor parameter dependencies
- `withDecorators(container)` — reads registry, auto-binds, returns `DecoratorContainer`
- `DecoratorContainer` — resolve/has/validate/createScope (no `bind`)
- Mutual exclusivity: factory bindings and decorator bindings don't mix in one container
- Lifecycle options: singleton (default), transient, scoped
- `clearRegistry()` — for testing, prevents registration leakage
- Error cases: missing token, missing @Inject, duplicate tokens, circular deps
- Full example: ports → decorated classes → withDecorators → createHexApp

---

## Tools

Tools are functions the AI can invoke to generate beebear code.
Each tool returns a TypeScript code string.

### `scaffold_port`

Generate a port interface with its token.

**Input:**
```ts
{
  name: string;           // PascalCase, e.g. "RegisterUser"
  direction: "inbound" | "outbound";
  // For inbound (use case) ports:
  inputType?: string;     // e.g. "{ email: string; name: string }"
  outputType?: string;    // e.g. "{ id: string }"
  // For outbound (dependency) ports:
  methods?: Array<{
    name: string;         // e.g. "findByEmail"
    params: string;       // e.g. "email: string"
    returnType: string;   // e.g. "Promise<User | null>"
  }>;
}
```

**Output (inbound):**
```ts
import { Port } from 'beebear';
import type { UseCase } from 'beebear';

export interface RegisterUser extends UseCase<
  { email: string; name: string },
  { id: string }
> {}

export const RegisterUser = Port<RegisterUser>('RegisterUser');
```

**Output (outbound):**
```ts
import { Port } from 'beebear';

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

export const UserRepository = Port<UserRepository>('UserRepository');
```

### `scaffold_use_case`

Generate a use case class implementing a driving port.

**Input:**
```ts
{
  name: string;              // e.g. "RegisterUserService"
  port: string;              // e.g. "RegisterUser" (the inbound port it implements)
  inputType: string;         // e.g. "{ email: string; name: string }"
  outputType: string;        // e.g. "{ id: string }"
  dependencies?: Array<{
    name: string;            // e.g. "userRepository"
    type: string;            // e.g. "UserRepository"
  }>;
}
```

**Output:**
```ts
import type { RegisterUser } from '../ports/inbound/RegisterUser.js';
import type { UserRepository } from '../ports/outbound/UserRepository.js';

export class RegisterUserService implements RegisterUser {
  constructor(
    private readonly userRepository: UserRepository,
  ) {}

  async execute(input: { email: string; name: string }): Promise<{ id: string }> {
    // TODO: implement business logic
    throw new Error('Not implemented');
  }
}
```

### `scaffold_adapter`

Generate an adapter class implementing an outbound port.

**Input:**
```ts
{
  name: string;          // e.g. "PrismaUserRepository"
  port: string;          // e.g. "UserRepository" (the outbound port it implements)
  methods: Array<{
    name: string;
    params: string;
    returnType: string;
  }>;
}
```

**Output:**
```ts
import type { UserRepository } from '../../domain/ports/outbound/UserRepository.js';

export class PrismaUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    // TODO: implement
    throw new Error('Not implemented');
  }

  async save(user: User): Promise<void> {
    // TODO: implement
    throw new Error('Not implemented');
  }
}
```

### `scaffold_route`

Generate an HTTP route using httpAdapter.

**Input:**
```ts
{
  useCaseToken: string;    // e.g. "RegisterUser"
  method: string;          // e.g. "POST"
  path: string;            // e.g. "/users"
  inputMapping: string;    // e.g. "{ email: req.body.email, name: req.body.name }"
  statusOverride?: number; // e.g. 200 (optional, overrides method default)
}
```

**Output:**
```ts
app.post('/users', hex.httpAdapter(RegisterUser, {
  toInput: (req) => ({
    email: req.body.email,
    name: req.body.name,
  }),
}));
```

### `scaffold_container_setup`

Generate container binding code for a set of ports, use cases, and adapters.

**Input:**
```ts
{
  bindings: Array<{
    token: string;           // e.g. "UserRepository"
    implementation: string;  // e.g. "PrismaUserRepository"
    dependencies?: string[]; // e.g. ["UserRepository"] — tokens to resolve
  }>;
}
```

**Output:**
```ts
import { createContainer } from 'beebear';
import { UserRepository } from './domain/ports/outbound/UserRepository.js';
import { RegisterUser } from './domain/ports/inbound/RegisterUser.js';
import { PrismaUserRepository } from './infrastructure/persistence/PrismaUserRepository.js';
import { RegisterUserService } from './domain/use-cases/RegisterUserService.js';

const container = createContainer();

// Driven ports (dependencies)
container.bind(UserRepository, () => new PrismaUserRepository());

// Driving ports (use cases)
container.bind(RegisterUser, (c) => new RegisterUserService(
  c.resolve(UserRepository),
));

container.validate();
```

### `scaffold_decorator_setup`

Generate decorator-based DI setup using `@beebear-plugins/di-decorators`.

**Input:**
```ts
{
  implementations: Array<{
    token: string;           // e.g. "UserRepository"
    className: string;       // e.g. "PrismaUserRepository"
    dependencies?: string[]; // e.g. ["UserRepository"] — tokens to @Inject
    lifecycle?: "singleton" | "transient" | "scoped";
  }>;
}
```

**Output:**
```ts
import { Port, createContainer, createHexApp } from 'beebear';
import { Injectable, Inject, withDecorators } from '@beebear-plugins/di-decorators';
import type { UserRepository } from './domain/ports/outbound/UserRepository.js';
import type { RegisterUser } from './domain/ports/inbound/RegisterUser.js';

@Injectable(UserRepository)
class PrismaUserRepository implements UserRepository {
  // TODO: implement methods
}

@Injectable(RegisterUser)
class RegisterUserService implements RegisterUser {
  constructor(
    @Inject(UserRepository) private readonly userRepository: UserRepository,
  ) {}

  async execute(input: { email: string; name: string }) {
    // TODO: implement business logic
    throw new Error('Not implemented');
  }
}

const container = withDecorators(createContainer());
container.validate();

const hex = createHexApp({ container });
```

---

## Prompts

Prompts are user-triggered workflows that guide the AI through multi-step tasks.

### `new-project`

**Description:** "Set up a new beebear project from scratch"

**Arguments:**
- `framework`: "express" | "fastify" | "hono"
- `name`: project name

**Template output:** Step-by-step instructions including:
1. Create project directory and init npm
2. Install beebear + chosen framework
3. Create folder structure (domain/ports, use-cases, infrastructure)
4. Create composition root with createContainer + createHexApp
5. Create first port, use case, adapter as examples
6. Wire up routes
7. Add dev script and start

### `add-feature`

**Description:** "Add a new feature to an existing beebear project"

**Arguments:**
- `featureName`: e.g. "RegisterUser"
- `description`: what it does

**Template output:** Step-by-step:
1. Define inbound port (interface + token)
2. Define outbound ports if needed
3. Implement use case
4. Implement adapters
5. Add container bindings
6. Add HTTP route
7. Test

---

## Server Setup

### Entry point (`src/index.ts`)

```ts
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  { name: 'beebear-mcp', version: '0.1.0' },
  { capabilities: { resources: {}, tools: {}, prompts: {} } },
);

// Register all handlers...

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Transport

stdio only. The server is launched as a subprocess by the AI client.
All debug logging goes to `stderr` (stdout is reserved for JSON-RPC).

---

## Behavior Rules

1. **Resources are static.** They return the same content every time.
   No filesystem access, no dynamic introspection of the user's project.

2. **Tools return code strings.** They don't write files. The AI assistant
   handles file creation and placement.

3. **All generated code uses beebear imports.** Never raw symbols or
   untyped patterns. Always `import { Port } from 'beebear'`, etc.

4. **Tools validate input.** Invalid names (not PascalCase for ports),
   missing required fields → return an error message with `isError: true`.

5. **Prompts are templates.** They return structured text the AI follows.
   They don't execute anything.

6. **No file system access.** The MCP server is stateless and portable.
   It doesn't read or write the user's project files.

7. **Debug logs to stderr.** stdout is reserved for JSON-RPC protocol
   messages between the server and the AI client.

---

## Non-Goals

- No project analysis or architecture validation (would need filesystem access)
- No live code modification (AI handles file writes)
- No database or network access
- No beebear runtime dependency (resources are static markdown, tools generate strings)
- No authentication or authorization
- No SSE/HTTP transport (stdio only for v1)
