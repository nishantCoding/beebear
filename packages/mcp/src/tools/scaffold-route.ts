import { z } from 'zod';
import { isPascalCase, makeErrorResult, makeSuccessResult } from './helpers.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const scaffoldRouteSchema = {
  useCaseToken: z.string().describe('Use case port name, e.g. "RegisterUser"'),
  method: z.string().describe('HTTP method, e.g. "POST"'),
  path: z.string().describe('Route path, e.g. "/users"'),
  inputMapping: z.string().describe('Input mapping expression, e.g. "{ email: req.body.email }"'),
  statusOverride: z.number().optional().describe('Custom HTTP status (overrides method default)'),
};

export type ScaffoldRouteInput = z.objectOutputType<typeof scaffoldRouteSchema, z.ZodTypeAny>;

export function scaffoldRoute(input: ScaffoldRouteInput): string {
  const method = input.method.toLowerCase();
  const statusOpt = input.statusOverride != null
    ? `\n  status: ${input.statusOverride},`
    : '';

  return `app.${method}('${input.path}', hex.httpAdapter(${input.useCaseToken}, {
  toInput: (req) => (${input.inputMapping}),${statusOpt}
}));
`;
}

export function handleScaffoldRoute(input: ScaffoldRouteInput): CallToolResult {
  if (!isPascalCase(input.useCaseToken)) {
    return makeErrorResult(`Use case token "${input.useCaseToken}" must be PascalCase`);
  }
  return makeSuccessResult(scaffoldRoute(input));
}
