import { z } from 'zod';
import { isPascalCase, makeErrorResult, makeSuccessResult, buildImportLines } from './helpers.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const scaffoldEntitySchema = {
  name: z.string().describe('PascalCase entity name, e.g. "OrderItem"'),
  idType: z.enum(['string', 'number']).describe('Type of the entity ID'),
  properties: z.array(z.object({
    name: z.string(),
    type: z.string(),
    readonly: z.boolean().optional(),
  })).optional().describe('Entity properties'),
};

export type ScaffoldEntityInput = z.objectOutputType<typeof scaffoldEntitySchema, z.ZodTypeAny>;

export function scaffoldEntity(input: ScaffoldEntityInput): string {
  const imports = buildImportLines([
    { names: ['Entity'], from: '@beebear-plugins/ddd' },
  ]);

  const props = input.properties ?? [];
  const ctorParams = [
    `    id: ${input.idType},`,
    ...props.map((p) => {
      const mod = p.readonly ? 'readonly ' : '';
      return `    public ${mod}${p.name}: ${p.type},`;
    }),
  ].join('\n');

  return `${imports}

export class ${input.name} extends Entity<${input.idType}> {
  constructor(
${ctorParams}
  ) {
    super(id);
  }
}
`;
}

export function handleScaffoldEntity(input: ScaffoldEntityInput): CallToolResult {
  if (!isPascalCase(input.name)) {
    return makeErrorResult(`Entity name "${input.name}" must be PascalCase`);
  }
  return makeSuccessResult(scaffoldEntity(input));
}
