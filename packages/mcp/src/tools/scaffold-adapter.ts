import { z } from 'zod';
import { isPascalCase, makeErrorResult, makeSuccessResult, buildImportLines, generateMethodStubs } from './helpers.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const scaffoldAdapterSchema = {
  name: z.string().describe('PascalCase class name, e.g. "PrismaUserRepository"'),
  port: z.string().describe('The outbound port it implements, e.g. "UserRepository"'),
  methods: z.array(z.object({
    name: z.string(),
    params: z.string(),
    returnType: z.string(),
  })).describe('Methods to implement'),
};

export type ScaffoldAdapterInput = z.objectOutputType<typeof scaffoldAdapterSchema, z.ZodTypeAny>;

export function scaffoldAdapter(input: ScaffoldAdapterInput): string {
  const imports = buildImportLines([
    { names: [input.port], from: 'beebear', typeOnly: true },
  ]);

  const methods = generateMethodStubs(input.methods);

  return `${imports}

export class ${input.name} implements ${input.port} {
${methods}
}
`;
}

export function handleScaffoldAdapter(input: ScaffoldAdapterInput): CallToolResult {
  if (!isPascalCase(input.name)) {
    return makeErrorResult(`Class name "${input.name}" must be PascalCase`);
  }
  if (!isPascalCase(input.port)) {
    return makeErrorResult(`Port name "${input.port}" must be PascalCase`);
  }
  if (input.methods.length === 0) {
    return makeErrorResult('Adapter requires at least one method');
  }
  return makeSuccessResult(scaffoldAdapter(input));
}
