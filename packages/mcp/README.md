# @beebear-plugins/mcp

MCP (Model Context Protocol) server that teaches AI coding assistants how to use [beebear](https://github.com/nishantCoding/beebear) — the hexagonal architecture framework for Node.js/TypeScript.

## What It Does

AI assistants don't know beebear. They'll generate decorator-heavy code, skip `Port<T>()` tokens, put logic in adapters, and miss error mapping. This MCP server fixes that by providing:

- **8 Resources** — Documentation on beebear's API, patterns, project structure, errors, HTTP adapters, decorators plugin, and DDD plugin
- **10 Tools** — Code scaffold generators for ports, use cases, adapters, routes, container setup, DDD building blocks, and decorator setup
- **2 Prompts** — Guided workflows for creating new projects and adding features

## Installation

```bash
npm install -g @beebear-plugins/mcp
```

## Usage

### With Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "beebear": {
      "command": "beebear-mcp"
    }
  }
}
```

### With Claude Code

```bash
claude mcp add beebear-mcp -- beebear-mcp
```

### With any MCP client

The server runs on stdio transport:

```bash
beebear-mcp
```

## Resources

| Resource | URI | Content |
|---|---|---|
| overview | `beebear://docs/overview` | What beebear is, core concepts, plugin ecosystem |
| api | `beebear://docs/api` | Full API reference with type signatures |
| patterns | `beebear://docs/patterns` | Port definition, use cases, adapters, container binding, HTTP routes, hooks |
| project-structure | `beebear://docs/project-structure` | Standard folder layout and what goes where |
| errors | `beebear://docs/errors` | Error hierarchy, HTTP status mapping, custom errors |
| http-adapters | `beebear://docs/http-adapters` | Express/Fastify/Hono examples, custom strategies |
| decorators | `beebear://docs/decorators` | @Injectable, @Inject, withDecorators |
| ddd | `beebear://docs/ddd` | ValueObject, Entity, AggregateRoot, DomainEvent |

## Tools

| Tool | Description |
|---|---|
| `scaffold_port` | Generate inbound (UseCase) or outbound (dependency) port |
| `scaffold_use_case` | Generate use case class implementing a driving port |
| `scaffold_adapter` | Generate adapter class implementing an outbound port |
| `scaffold_route` | Generate HTTP route with `hex.httpAdapter()` |
| `scaffold_container_setup` | Generate container bindings with `createContainer()` |
| `scaffold_entity` | Generate DDD Entity subclass |
| `scaffold_value_object` | Generate DDD ValueObject with validation |
| `scaffold_aggregate` | Generate AggregateRoot with domain events |
| `scaffold_event_publisher` | Generate EventPublisher port + transport adapter |
| `scaffold_decorator_setup` | Generate @Injectable/@Inject decorator setup |

## Prompts

| Prompt | Args | Description |
|---|---|---|
| `new-project` | `framework` (express/fastify/hono), `name` | Step-by-step new project setup |
| `add-feature` | `featureName`, `description` | Add a feature with ports, use case, adapter, route, tests |

## License

MIT
