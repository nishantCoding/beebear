import { z } from 'zod';
import { isPascalCase, makeErrorResult, makeSuccessResult, buildImportLines } from './helpers.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const scaffoldUseCaseSchema = {
  name: z.string().describe('PascalCase class name, e.g. "RegisterUserService"'),
  port: z.string().describe('The inbound port it implements, e.g. "RegisterUser"'),
  inputType: z.string().describe('Use case input type, e.g. "{ email: string; name: string }"'),
  outputType: z.string().describe('Use case output type, e.g. "{ id: string }"'),
  dependencies: z.array(z.object({
    name: z.string().describe('Parameter name, e.g. "userRepository"'),
    type: z.string().describe('Port type name, e.g. "UserRepository"'),
  })).optional().describe('Constructor dependencies (driven ports)'),
};

export type ScaffoldUseCaseInput = z.objectOutputType<typeof scaffoldUseCaseSchema, z.ZodTypeAny>;

export function scaffoldUseCase(input: ScaffoldUseCaseInput): string {
  const deps = input.dependencies ?? [];

  const typeImports: string[] = [input.port];
  for (const dep of deps) {
    if (!typeImports.includes(dep.type)) {
      typeImports.push(dep.type);
    }
  }

  const imports = buildImportLines([
    { names: typeImports, from: 'beebear', typeOnly: true },
  ]);

  const ctorParams = deps
    .map((d) => `    private readonly ${d.name}: ${d.type},`)
    .join('\n');

  const ctor = deps.length > 0
    ? `\n  constructor(\n${ctorParams}\n  ) {}\n`
    : '';

  return `${imports}

export class ${input.name} implements ${input.port} {${ctor}
  async execute(input: ${input.inputType}): Promise<${input.outputType}> {
    // TODO: implement business logic
    throw new Error('Not implemented');
  }
}
`;
}

export function handleScaffoldUseCase(input: ScaffoldUseCaseInput): CallToolResult {
  if (!isPascalCase(input.name)) {
    return makeErrorResult(`Class name "${input.name}" must be PascalCase`);
  }
  if (!isPascalCase(input.port)) {
    return makeErrorResult(`Port name "${input.port}" must be PascalCase`);
  }
  return makeSuccessResult(scaffoldUseCase(input));
}
