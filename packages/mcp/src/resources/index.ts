import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OVERVIEW } from './overview.js';
import { API } from './api.js';
import { PATTERNS } from './patterns.js';
import { PROJECT_STRUCTURE } from './project-structure.js';
import { ERRORS } from './errors.js';
import { HTTP_ADAPTERS } from './http-adapters.js';
import { DECORATORS } from './decorators.js';
import { DDD } from './ddd.js';

const resources = [
  { name: 'overview', uri: 'beebear://docs/overview', content: OVERVIEW },
  { name: 'api', uri: 'beebear://docs/api', content: API },
  { name: 'patterns', uri: 'beebear://docs/patterns', content: PATTERNS },
  { name: 'project-structure', uri: 'beebear://docs/project-structure', content: PROJECT_STRUCTURE },
  { name: 'errors', uri: 'beebear://docs/errors', content: ERRORS },
  { name: 'http-adapters', uri: 'beebear://docs/http-adapters', content: HTTP_ADAPTERS },
  { name: 'decorators', uri: 'beebear://docs/decorators', content: DECORATORS },
  { name: 'ddd', uri: 'beebear://docs/ddd', content: DDD },
] as const;

export function registerResources(server: McpServer): void {
  for (const res of resources) {
    server.registerResource(res.name, res.uri, { mimeType: 'text/markdown' }, async () => ({
      contents: [{ uri: res.uri, mimeType: 'text/markdown', text: res.content }],
    }));
  }
}
