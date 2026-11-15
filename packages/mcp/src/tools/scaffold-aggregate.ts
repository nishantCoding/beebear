import { z } from 'zod';
import { isPascalCase, makeErrorResult, makeSuccessResult, buildImportLines } from './helpers.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const scaffoldAggregateSchema = {
  name: z.string().describe('PascalCase aggregate name, e.g. "Order"'),
  idType: z.enum(['string', 'number']).describe('Type of the aggregate ID'),
  events: z.array(z.object({
    name: z.string().describe('Event class name, e.g. "OrderPlaced"'),
    fields: z.array(z.object({
      name: z.string(),
      type: z.string(),
    })).optional().describe('Event-specific fields'),
  })).optional().describe('Domain events emitted by this aggregate'),
};

export type ScaffoldAggregateInput = z.objectOutputType<typeof scaffoldAggregateSchema, z.ZodTypeAny>;

export function scaffoldAggregate(input: ScaffoldAggregateInput): string {
  const imports = buildImportLines([
    { names: ['AggregateRoot', 'DomainEvent'], from: '@beebear-plugins/ddd' },
  ]);

  const events = input.events ?? [];

  // Generate event classes
  const eventClasses = events.map((event) => {
    const fields = event.fields ?? [];
    const ctorFields = fields
      .map((f) => `readonly ${f.name}: ${f.type}`)
      .join(', ');
    const ctorParams = ctorFields
      ? `${input.name.toLowerCase()}Id: ${input.idType}, ${ctorFields}`
      : `${input.name.toLowerCase()}Id: ${input.idType}`;

    return `export class ${event.name} extends DomainEvent {
  constructor(${ctorParams}) {
    super('${event.name}', ${input.name.toLowerCase()}Id);
  }
}`;
  });

  // Generate aggregate class with stub methods for each event
  const methods = events.map((event) => {
    const methodName = event.name.charAt(0).toLowerCase() + event.name.slice(1);
    const fields = event.fields ?? [];
    const params = fields.map((f) => `${f.name}: ${f.type}`).join(', ');
    const args = [
      `this.id`,
      ...fields.map((f) => f.name),
    ].join(', ');

    return `  ${methodName}(${params}) {
    // TODO: enforce invariants
    this.addEvent(new ${event.name}(${args}));
  }`;
  });

  const methodsBlock = methods.length > 0
    ? '\n' + methods.join('\n\n') + '\n'
    : '\n  // TODO: add domain methods that emit events via this.addEvent()\n';

  return `${imports}

${eventClasses.join('\n\n')}

export class ${input.name} extends AggregateRoot<${input.idType}> {${methodsBlock}}
`;
}

export function handleScaffoldAggregate(input: ScaffoldAggregateInput): CallToolResult {
  if (!isPascalCase(input.name)) {
    return makeErrorResult(`Aggregate name "${input.name}" must be PascalCase`);
  }
  for (const event of input.events ?? []) {
    if (!isPascalCase(event.name)) {
      return makeErrorResult(`Event name "${event.name}" must be PascalCase`);
    }
  }
  return makeSuccessResult(scaffoldAggregate(input));
}
