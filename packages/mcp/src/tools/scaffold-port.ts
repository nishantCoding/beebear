import { z } from 'zod';
import { isPascalCase, makeErrorResult, makeSuccessResult, buildImportLines } from './helpers.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const scaffoldPortSchema = {
  name: z.string().describe('PascalCase port name, e.g. "UserRepository"'),
  direction: z.enum(['inbound', 'outbound']).describe('inbound = use case port, outbound = dependency port'),
  inputType: z.string().optional().describe('For inbound: use case input type, e.g. "{ email: string }"'),
  outputType: z.string().optional().describe('For inbound: use case output type, e.g. "{ id: string }"'),
  methods: z.array(z.object({
    name: z.string(),
    params: z.string(),
    returnType: z.string(),
  })).optional().describe('For outbound: port methods'),
};

export type ScaffoldPortInput = z.objectOutputType<typeof scaffoldPortSchema, z.ZodTypeAny>;

export function scaffoldPort(input: ScaffoldPortInput): string {
  if (input.direction === 'inbound') {
    const inputType = input.inputType ?? 'void';
    const outputType = input.outputType ?? 'void';
    const imports = buildImportLines([
      { names: ['Port'], from: 'beebear' },
      { names: ['UseCase'], from: 'beebear', typeOnly: true },
    ]);
    return `${imports}

export interface ${input.name} extends UseCase<${inputType}, ${outputType}> {}

export const ${input.name} = Port<${input.name}>('${input.name}');
`;
  }

  // Outbound
  const imports = buildImportLines([
    { names: ['Port'], from: 'beebear' },
  ]);
  const methods = (input.methods ?? [])
    .map((m) => `  ${m.name}(${m.params}): ${m.returnType};`)
    .join('\n');

  return `${imports}

export interface ${input.name} {
${methods}
}

export const ${input.name} = Port<${input.name}>('${input.name}');
`;
}

export function handleScaffoldPort(input: ScaffoldPortInput): CallToolResult {
  if (!isPascalCase(input.name)) {
    return makeErrorResult(`Port name "${input.name}" must be PascalCase (e.g. "UserRepository")`);
  }
  if (input.direction === 'outbound' && (!input.methods || input.methods.length === 0)) {
    return makeErrorResult('Outbound ports require at least one method');
  }
  return makeSuccessResult(scaffoldPort(input));
}
