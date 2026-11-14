# Roadmap & Development Approach

---

## Development Approach: Spec-Driven Development (SDD)

We build beebear using SDD — specification first, code second.

For each component:
1. **Spec** — define the public API, types, behavior, edge cases in a spec document
2. **Tests** — write tests against the spec before implementation
3. **Implement** — write the code to pass the tests
4. **Validate** — verify the implementation matches the spec exactly

This is slower but eliminates rework. Every public API surface is deliberate,
every behavior is documented before it exists, and every edge case is considered
upfront — not discovered in production.

---

## Build Order

### Phase 1: Core (`beebear`)

1. `Port<T>()` — typed token factory with declaration merging
2. DI Container — bind, resolve, validate, singleton/transient/scoped lifecycles
3. Domain error base classes — DomainError, ValidationError, NotFoundError, etc.
4. Use case contract — `UseCase<TInput, TOutput>` interface
5. `hex.execute()` — framework-agnostic use case runner with error mapping
6. `hex.adaptRoute()` — framework strategy pattern (auto-detect Express/Fastify/Hono)
7. `createHexApp()` — ties container + errorMap + strategy together

### Phase 2: CLI (`@beebear/cli`)

1. `npx beebear new <app-name>` — scaffold project structure
2. `npx beebear generate port <name>` — generate port with interface + token
3. `npx beebear generate use-case <name>` — generate use case implementing a port
4. `npx beebear generate adapter <name>` — generate adapter implementing a port

### Phase 3: Testing Utilities (`@beebear/testing`)

1. Test container with adapter overrides
2. In-memory adapter helpers

### Phase 4: DDD Plugin (`@beebear/ddd`)

1. Entity, ValueObject, AggregateRoot base classes
2. Domain event collection + dispatch

### Phase 5: AI Integration

1. `llms.txt` on docs site — plain text framework summary for any LLM
2. `@beebear/mcp` — MCP server for AI coding assistants (Cursor, Claude Code, etc.)
   - **Resources:** framework docs, API reference, patterns, project structure
   - **Tools:** scaffold-port, scaffold-use-case, scaffold-adapter, validate-architecture
   - Developer adds to MCP config → AI assistant generates idiomatic beebear code

---

## Publish Strategy

- All packages under MIT license
- Monorepo: `beebear`, `@beebear/cli`, `@beebear/testing`, `@beebear/ddd`, `@beebear/mcp`
- Core `beebear` has zero runtime dependencies
- Plugins depend on core but core never depends on plugins

---

## Monetization Strategy

The framework itself is free (MIT). Revenue comes from everything around it.

### Immediate (while building the framework)

- **YouTube / blog content** about hex arch in Node.js/TS — builds authority and
  audience. No direct revenue, but drives all other monetization.

### At Launch

- **Ebook on Leanpub/Gumroad** — "Hexagonal Architecture in Node.js with TypeScript"
  - ~85-105 pages, intermediate level
  - Covers hex arch fundamentals + beebear framework usage + building a complete app
  - Pricing: minimum $14.99, suggested $19.99 (Leanpub gives 80% royalty)
  - Can publish in-progress at $9.99, raise at completion
  - Written in Markdown, publishable directly on Leanpub
  - Book sales are driven by framework adoption, not the other way around

- **Text-based course on Educative.io** — same content adapted to interactive
  format. No video or camera needed. Educative pays royalties per learner.

### After Adoption (2,000+ GitHub stars)

- **Premium CLI templates** — `npx beebear new my-app --template ecommerce`
  - Production-ready templates: auth, payments, multi-tenancy, testing, CI/CD, Docker
  - One-time purchase or subscription for all templates
  - Zero human interaction needed — developer pays, downloads, done

- **Video course (Udemy / own platform)** — screen recordings of code +
  AI-narrated voiceover via ElevenLabs (clone own voice from 30 min sample,
  generate natural audio from written scripts). No camera needed.

### Long Term

- **Architecture linting SaaS** — hosted service or GitHub Action
  - Detects dependency rule violations (domain importing infrastructure)
  - Detects missing port bindings
  - Visualizes port/adapter dependency graph
  - Architecture drift detection on PRs
  - Free tier (basic) + paid tier (CI integration, team dashboard)

- **Consulting & enterprise support** — architecture reviews, migration help
  (NestJS/Express spaghetti → hex arch), team training workshops, support contracts

- **Sponsored development** — GitHub Sponsors, Open Collective, Polar.sh.
  Companies using beebear in production sponsor features they need.

### Revenue Sequence

```
1. Ship framework → get stars and users (no revenue yet)
2. Write content (blog/YouTube) → build audience (no revenue yet)
3. Publish ebook + Educative course → first revenue stream
4. Premium templates → passive income, no communication needed
5. Architecture linting SaaS → recurring revenue
6. Consulting → high-ticket, scales with framework popularity
```

Framework adoption drives everything. Without users, nothing else works.
