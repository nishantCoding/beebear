import { z } from 'zod';

export const newProjectSchema = {
  framework: z.enum(['express', 'fastify', 'hono']).describe('HTTP framework to use'),
  name: z.string().describe('Project name'),
};

export type NewProjectInput = z.objectOutputType<typeof newProjectSchema, z.ZodTypeAny>;

export function newProjectPrompt(args: NewProjectInput): string {
  return `# Set Up a New beebear Project: ${args.name}

## Step 1: Initialize the project

\`\`\`bash
mkdir ${args.name} && cd ${args.name}
npm init -y
npm install beebear ${args.framework}
npm install -D typescript tsup @types/node
npx tsc --init --target ES2022 --module ESNext --moduleResolution bundler --strict --outDir dist --rootDir src
\`\`\`

Set \`"type": "module"\` in package.json.

## Step 2: Create folder structure

\`\`\`bash
mkdir -p src/domain/ports/inbound
mkdir -p src/domain/ports/outbound
mkdir -p src/domain/use-cases
mkdir -p src/domain/errors
mkdir -p src/domain/models
mkdir -p src/infrastructure/persistence
mkdir -p src/infrastructure/http
mkdir -p src/infrastructure/services
\`\`\`

## Step 3: Define your first outbound port

Create \`src/domain/ports/outbound/UserRepository.ts\`:

\`\`\`ts
import { Port } from 'beebear';

export interface UserRepository {
  findById(id: string): Promise<{ id: string; name: string } | null>;
  save(user: { id: string; name: string }): Promise<void>;
}

export const UserRepository = Port<UserRepository>('UserRepository');
\`\`\`

## Step 4: Define your first inbound port (use case)

Create \`src/domain/ports/inbound/GetUser.ts\`:

\`\`\`ts
import { Port } from 'beebear';
import type { UseCase } from 'beebear';

export interface GetUser extends UseCase<{ id: string }, { id: string; name: string }> {}

export const GetUser = Port<GetUser>('GetUser');
\`\`\`

## Step 5: Implement the use case

Create \`src/domain/use-cases/GetUserService.ts\`:

\`\`\`ts
import type { GetUser } from '../ports/inbound/GetUser.js';
import type { UserRepository } from '../ports/outbound/UserRepository.js';
import { NotFoundError } from 'beebear';

export class GetUserService implements GetUser {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(input: { id: string }) {
    const user = await this.userRepository.findById(input.id);
    if (!user) throw new NotFoundError('User not found');
    return user;
  }
}
\`\`\`

## Step 6: Implement the adapter

Create \`src/infrastructure/persistence/InMemoryUserRepository.ts\`:

\`\`\`ts
import type { UserRepository } from '../../domain/ports/outbound/UserRepository.js';

export class InMemoryUserRepository implements UserRepository {
  private users = new Map<string, { id: string; name: string }>();

  async findById(id: string) {
    return this.users.get(id) ?? null;
  }

  async save(user: { id: string; name: string }) {
    this.users.set(user.id, user);
  }
}
\`\`\`

## Step 7: Wire everything together

Create \`src/index.ts\`:

\`\`\`ts
import { createContainer, createHexApp } from 'beebear';
import { UserRepository } from './domain/ports/outbound/UserRepository.js';
import { GetUser } from './domain/ports/inbound/GetUser.js';
import { InMemoryUserRepository } from './infrastructure/persistence/InMemoryUserRepository.js';
import { GetUserService } from './domain/use-cases/GetUserService.js';
${args.framework === 'express' ? "import express from 'express';" : ''}${args.framework === 'fastify' ? "import Fastify from 'fastify';" : ''}${args.framework === 'hono' ? "import { Hono } from 'hono';" : ''}

const container = createContainer();
container.bind(UserRepository, () => new InMemoryUserRepository());
container.bind(GetUser, (c) => new GetUserService(c.resolve(UserRepository)));
container.validate();

const hex = createHexApp({ container, framework: '${args.framework}' });

${args.framework === 'express' ? `const app = express();
app.use(express.json());

app.get('/users/:id', hex.httpAdapter(GetUser, {
  toInput: (req) => ({ id: req.params.id }),
}));

app.listen(3000, () => console.log('Listening on :3000'));` : ''}${args.framework === 'fastify' ? `const app = Fastify();

app.get('/users/:id', hex.httpAdapter(GetUser, {
  toInput: (req) => ({ id: (req.params as any).id }),
}));

app.listen({ port: 3000 }).then(() => console.log('Listening on :3000'));` : ''}${args.framework === 'hono' ? `const app = new Hono();

app.get('/users/:id', hex.httpAdapter(GetUser, {
  toInput: (req) => ({ id: req.param('id') }),
}));

export default app;` : ''}
\`\`\`

## Step 8: Run

\`\`\`bash
npx tsup src/index.ts --format esm
node dist/index.js
\`\`\`

You now have a working beebear app with hexagonal architecture: domain logic in the hexagon, infrastructure outside, wired through ports and adapters.
`;
}
