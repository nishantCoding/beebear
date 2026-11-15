import { z } from 'zod';

export const addFeatureSchema = {
  featureName: z.string().describe('Feature name in PascalCase, e.g. "RegisterUser"'),
  description: z.string().describe('What the feature does'),
};

export type AddFeatureInput = z.objectOutputType<typeof addFeatureSchema, z.ZodTypeAny>;

export function addFeaturePrompt(args: AddFeatureInput): string {
  return `# Add Feature: ${args.featureName}

**Description:** ${args.description}

## Step 1: Define the inbound port

Create \`src/domain/ports/inbound/${args.featureName}.ts\`:

\`\`\`ts
import { Port } from 'beebear';
import type { UseCase } from 'beebear';

export interface ${args.featureName} extends UseCase<
  { /* TODO: define input type */ },
  { /* TODO: define output type */ }
> {}

export const ${args.featureName} = Port<${args.featureName}>('${args.featureName}');
\`\`\`

## Step 2: Define outbound ports (if needed)

If this feature needs to talk to a database, external service, or other infrastructure, define outbound ports:

\`\`\`ts
import { Port } from 'beebear';

export interface SomeRepository {
  // TODO: define methods
}

export const SomeRepository = Port<SomeRepository>('SomeRepository');
\`\`\`

## Step 3: Implement the use case

Create \`src/domain/use-cases/${args.featureName}Service.ts\`:

\`\`\`ts
import type { ${args.featureName} } from '../ports/inbound/${args.featureName}.js';

export class ${args.featureName}Service implements ${args.featureName} {
  constructor(
    // TODO: inject driven ports
  ) {}

  async execute(input: { /* TODO */ }) {
    // TODO: implement business logic
    // - Enforce domain rules
    // - Call driven ports (repositories, services)
    // - Return result
    throw new Error('Not implemented');
  }
}
\`\`\`

## Step 4: Implement adapters

Create adapter classes for each outbound port used by this feature.

## Step 5: Add container bindings

In your composition root:

\`\`\`ts
container.bind(SomeRepository, () => new SomeRepositoryImpl());
container.bind(${args.featureName}, (c) => new ${args.featureName}Service(
  c.resolve(SomeRepository),
));
\`\`\`

## Step 6: Add HTTP route

\`\`\`ts
app.post('/<path>', hex.httpAdapter(${args.featureName}, {
  toInput: (req) => ({
    // TODO: map request to input
  }),
}));
\`\`\`

## Step 7: Test

1. Unit test the use case with mock adapters
2. Integration test through the HTTP route
3. Run \`container.validate()\` to catch missing bindings
`;
}
