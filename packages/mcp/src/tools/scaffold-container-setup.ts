import { z } from 'zod';
import { isPascalCase, makeErrorResult, makeSuccessResult } from './helpers.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const scaffoldContainerSetupSchema = {
  bindings: z.array(z.object({
    token: z.string().describe('Port/token name, e.g. "UserRepository"'),
    implementation: z.string().describe('Implementation class name, e.g. "PrismaUserRepository"'),
    dependencies: z.array(z.string()).optional().describe('Token names to resolve as constructor args'),
  })).describe('Bindings to generate'),
};

export type ScaffoldContainerSetupInput = z.objectOutputType<typeof scaffoldContainerSetupSchema, z.ZodTypeAny>;

export function scaffoldContainerSetup(input: ScaffoldContainerSetupInput): string {
  const tokenImports = new Set<string>();
  const implImports = new Set<string>();

  for (const b of input.bindings) {
    tokenImports.add(b.token);
    implImports.add(b.implementation);
    for (const dep of b.dependencies ?? []) {
      tokenImports.add(dep);
    }
  }

  const lines: string[] = [];
  lines.push(`import { createContainer } from 'beebear';`);

  // Import tokens
  for (const token of tokenImports) {
    lines.push(`import { ${token} } from './domain/ports/${token}.js';`);
  }

  // Import implementations
  for (const impl of implImports) {
    lines.push(`import { ${impl} } from './infrastructure/${impl}.js';`);
  }

  lines.push('');
  lines.push('const container = createContainer();');
  lines.push('');

  for (const b of input.bindings) {
    const deps = b.dependencies ?? [];
    if (deps.length === 0) {
      lines.push(`container.bind(${b.token}, () => new ${b.implementation}());`);
    } else {
      const resolves = deps
        .map((d) => `  container.resolve(${d}),`)
        .join('\n');
      lines.push(`container.bind(${b.token}, (c) => new ${b.implementation}(\n${resolves}\n));`);
    }
  }

  lines.push('');
  lines.push('container.validate();');
  lines.push('');
  lines.push('export { container };');
  lines.push('');

  return lines.join('\n');
}

export function handleScaffoldContainerSetup(input: ScaffoldContainerSetupInput): CallToolResult {
  if (input.bindings.length === 0) {
    return makeErrorResult('At least one binding is required');
  }
  for (const b of input.bindings) {
    if (!isPascalCase(b.token)) {
      return makeErrorResult(`Token "${b.token}" must be PascalCase`);
    }
    if (!isPascalCase(b.implementation)) {
      return makeErrorResult(`Implementation "${b.implementation}" must be PascalCase`);
    }
  }
  return makeSuccessResult(scaffoldContainerSetup(input));
}
