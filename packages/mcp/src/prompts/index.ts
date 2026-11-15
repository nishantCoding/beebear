import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { newProjectSchema, newProjectPrompt } from './new-project.js';
import { addFeatureSchema, addFeaturePrompt } from './add-feature.js';

export function registerPrompts(server: McpServer): void {
  server.registerPrompt('new-project', {
    description: 'Set up a new beebear project from scratch',
    argsSchema: newProjectSchema,
  }, async (args) => ({
    messages: [{
      role: 'user',
      content: { type: 'text', text: newProjectPrompt(args) },
    }],
  }));

  server.registerPrompt('add-feature', {
    description: 'Add a new feature to an existing beebear project',
    argsSchema: addFeatureSchema,
  }, async (args) => ({
    messages: [{
      role: 'user',
      content: { type: 'text', text: addFeaturePrompt(args) },
    }],
  }));
}
