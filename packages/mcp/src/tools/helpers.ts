import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function isPascalCase(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

export function makeErrorResult(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

export function makeSuccessResult(code: string): CallToolResult {
  return {
    content: [{ type: 'text', text: code }],
  };
}

export function buildImportLines(
  imports: Array<{ names: string[]; from: string; typeOnly?: boolean }>,
): string {
  return imports
    .map(({ names, from, typeOnly }) => {
      const keyword = typeOnly ? 'import type' : 'import';
      return `${keyword} { ${names.join(', ')} } from '${from}';`;
    })
    .join('\n');
}

export function generateMethodStubs(
  methods: Array<{ name: string; params: string; returnType: string }>,
): string {
  return methods
    .map((m) => {
      const isAsync = m.returnType.startsWith('Promise');
      const prefix = isAsync ? 'async ' : '';
      return [
        `  ${prefix}${m.name}(${m.params}): ${m.returnType} {`,
        `    // TODO: implement`,
        `    throw new Error('Not implemented');`,
        `  }`,
      ].join('\n');
    })
    .join('\n\n');
}
