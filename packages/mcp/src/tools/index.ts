import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { scaffoldPortSchema, handleScaffoldPort } from './scaffold-port.js';
import { scaffoldUseCaseSchema, handleScaffoldUseCase } from './scaffold-use-case.js';
import { scaffoldAdapterSchema, handleScaffoldAdapter } from './scaffold-adapter.js';
import { scaffoldRouteSchema, handleScaffoldRoute } from './scaffold-route.js';
import { scaffoldContainerSetupSchema, handleScaffoldContainerSetup } from './scaffold-container-setup.js';
import { scaffoldEntitySchema, handleScaffoldEntity } from './scaffold-entity.js';
import { scaffoldValueObjectSchema, handleScaffoldValueObject } from './scaffold-value-object.js';
import { scaffoldAggregateSchema, handleScaffoldAggregate } from './scaffold-aggregate.js';
import { scaffoldEventPublisherSchema, handleScaffoldEventPublisher } from './scaffold-event-publisher.js';
import { scaffoldDecoratorSetupSchema, handleScaffoldDecoratorSetup } from './scaffold-decorator-setup.js';

const tools = [
  {
    name: 'scaffold_port',
    description: 'Generate a port interface with its token. Use direction="inbound" for use case ports, "outbound" for dependency ports.',
    schema: scaffoldPortSchema,
    handler: handleScaffoldPort,
  },
  {
    name: 'scaffold_use_case',
    description: 'Generate a use case class implementing a driving (inbound) port.',
    schema: scaffoldUseCaseSchema,
    handler: handleScaffoldUseCase,
  },
  {
    name: 'scaffold_adapter',
    description: 'Generate an adapter class implementing an outbound port.',
    schema: scaffoldAdapterSchema,
    handler: handleScaffoldAdapter,
  },
  {
    name: 'scaffold_route',
    description: 'Generate an HTTP route using hex.httpAdapter().',
    schema: scaffoldRouteSchema,
    handler: handleScaffoldRoute,
  },
  {
    name: 'scaffold_container_setup',
    description: 'Generate container binding code with createContainer(), bind(), and validate().',
    schema: scaffoldContainerSetupSchema,
    handler: handleScaffoldContainerSetup,
  },
  {
    name: 'scaffold_entity',
    description: 'Generate a DDD Entity subclass (@beebear-plugins/ddd).',
    schema: scaffoldEntitySchema,
    handler: handleScaffoldEntity,
  },
  {
    name: 'scaffold_value_object',
    description: 'Generate a DDD ValueObject subclass with validation (@beebear-plugins/ddd).',
    schema: scaffoldValueObjectSchema,
    handler: handleScaffoldValueObject,
  },
  {
    name: 'scaffold_aggregate',
    description: 'Generate a DDD AggregateRoot with domain events (@beebear-plugins/ddd).',
    schema: scaffoldAggregateSchema,
    handler: handleScaffoldAggregate,
  },
  {
    name: 'scaffold_event_publisher',
    description: 'Generate an EventPublisher outbound port and transport adapter (RabbitMQ, Kafka, SQS, or outbox).',
    schema: scaffoldEventPublisherSchema,
    handler: handleScaffoldEventPublisher,
  },
  {
    name: 'scaffold_decorator_setup',
    description: 'Generate decorator-based DI setup using @beebear-plugins/di-decorators.',
    schema: scaffoldDecoratorSetupSchema,
    handler: handleScaffoldDecoratorSetup,
  },
] as const;

export function registerTools(server: McpServer): void {
  for (const tool of tools) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.schema }, tool.handler as any);
  }
}
