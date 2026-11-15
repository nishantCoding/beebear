import { z } from 'zod';
import { isPascalCase, makeErrorResult, makeSuccessResult, buildImportLines } from './helpers.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const scaffoldValueObjectSchema = {
  name: z.string().describe('PascalCase name, e.g. "Money"'),
  props: z.array(z.object({
    name: z.string(),
    type: z.string(),
  })).describe('Value object properties'),
  validationRules: z.array(z.string()).optional().describe('Validation rules as human-readable strings'),
};

export type ScaffoldValueObjectInput = z.objectOutputType<typeof scaffoldValueObjectSchema, z.ZodTypeAny>;

export function scaffoldValueObject(input: ScaffoldValueObjectInput): string {
  const imports = buildImportLines([
    { names: ['ValueObject'], from: '@beebear-plugins/ddd' },
  ]);

  const propsInterface = `${input.name}Props`;
  const propLines = input.props
    .map((p) => `  ${p.name}: ${p.type};`)
    .join('\n');

  const getters = input.props
    .map((p) => `  get ${p.name}() { return this.props.${p.name}; }`)
    .join('\n');

  const rules = input.validationRules ?? [];
  const validateBody = rules.length > 0
    ? rules.map((r) => `    // TODO: ${r}`).join('\n')
    : '    // TODO: add validation rules';

  return `${imports}

interface ${propsInterface} {
${propLines}
}

export class ${input.name} extends ValueObject<${propsInterface}> {
  protected validate(props: ${propsInterface}) {
${validateBody}
  }

${getters}
}
`;
}

export function handleScaffoldValueObject(input: ScaffoldValueObjectInput): CallToolResult {
  if (!isPascalCase(input.name)) {
    return makeErrorResult(`Value object name "${input.name}" must be PascalCase`);
  }
  if (input.props.length === 0) {
    return makeErrorResult('Value object requires at least one property');
  }
  return makeSuccessResult(scaffoldValueObject(input));
}
