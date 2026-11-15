import { z } from 'zod';
import { isPascalCase, makeErrorResult, makeSuccessResult } from './helpers.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const scaffoldDecoratorSetupSchema = {
  implementations: z.array(z.object({
    token: z.string().describe('Port/token name, e.g. "UserRepository"'),
    className: z.string().describe('Implementation class name, e.g. "PrismaUserRepository"'),
    dependencies: z.array(z.string()).optional().describe('Token names for @Inject'),
    lifecycle: z.enum(['singleton', 'transient', 'scoped']).optional().describe('Lifecycle (default: singleton)'),
  })).describe('Implementations to register with decorators'),
};

export type ScaffoldDecoratorSetupInput = z.objectOutputType<typeof scaffoldDecoratorSetupSchema, z.ZodTypeAny>;

export function scaffoldDecoratorSetup(input: ScaffoldDecoratorSetupInput): string {
  const lines: string[] = [];

  lines.push(`import { createContainer, createHexApp } from 'beebear';`);
  lines.push(`import { Injectable, Inject, withDecorators } from '@beebear-plugins/di-decorators';`);

  // Collect type imports
  const typeNames = new Set<string>();
  for (const impl of input.implementations) {
    typeNames.add(impl.token);
    for (const dep of impl.dependencies ?? []) {
      typeNames.add(dep);
    }
  }

  if (typeNames.size > 0) {
    lines.push(`import type { ${[...typeNames].join(', ')} } from './ports.js';`);
  }

  lines.push('');

  for (const impl of input.implementations) {
    const deps = impl.dependencies ?? [];
    const lifecycle = impl.lifecycle ?? 'singleton';
    const lifecycleOpt = lifecycle !== 'singleton'
      ? `, { lifecycle: '${lifecycle}' }`
      : '';

    lines.push(`@Injectable(${impl.token}${lifecycleOpt})`);
    lines.push(`class ${impl.className} implements ${impl.token} {`);

    if (deps.length > 0) {
      lines.push('  constructor(');
      for (const dep of deps) {
        const paramName = dep.charAt(0).toLowerCase() + dep.slice(1);
        lines.push(`    @Inject(${dep}) private readonly ${paramName}: ${dep},`);
      }
      lines.push('  ) {}');
    }

    lines.push('');
    lines.push('  // TODO: implement methods');
    lines.push('}');
    lines.push('');
  }

  lines.push('const container = withDecorators(createContainer());');
  lines.push('container.validate();');
  lines.push('');
  lines.push('const hex = createHexApp({ container });');
  lines.push('');

  return lines.join('\n');
}

export function handleScaffoldDecoratorSetup(input: ScaffoldDecoratorSetupInput): CallToolResult {
  if (input.implementations.length === 0) {
    return makeErrorResult('At least one implementation is required');
  }
  for (const impl of input.implementations) {
    if (!isPascalCase(impl.token)) {
      return makeErrorResult(`Token "${impl.token}" must be PascalCase`);
    }
    if (!isPascalCase(impl.className)) {
      return makeErrorResult(`Class name "${impl.className}" must be PascalCase`);
    }
  }
  return makeSuccessResult(scaffoldDecoratorSetup(input));
}
