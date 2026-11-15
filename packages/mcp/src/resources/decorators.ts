export const DECORATORS = `# @beebear-plugins/di-decorators

## Overview

Optional decorator-based DI plugin for beebear. Provides \`@Injectable\` and \`@Inject\`
decorators for developers who prefer annotation-style dependency injection. Requires
only \`experimentalDecorators: true\` in tsconfig — no \`reflect-metadata\` needed.

## Installation

\`\`\`bash
npm install @beebear-plugins/di-decorators
\`\`\`

**tsconfig.json** — only one flag needed:
\`\`\`json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
\`\`\`

## API

### @Injectable(token, options?)

Class decorator. Registers the class in a global registry for auto-binding.

\`\`\`ts
import { Injectable, Inject } from '@beebear-plugins/di-decorators';
import { CreateOrderPort } from '../ports/inbound/create-order.port';
import { OrderRepository } from '../ports/outbound/order-repository.port';

@Injectable(CreateOrderPort)
export class CreateOrderUseCase {
  constructor(
    @Inject(OrderRepository) private readonly orderRepo: OrderRepository,
  ) {}

  async execute(input: CreateOrderInput): Promise<CreateOrderOutput> {
    // domain logic
  }
}
\`\`\`

### @Inject(token)

Parameter decorator. Marks a constructor parameter as a dependency to be resolved
from the container.

### withDecorators(container)

Reads the global registry populated by \`@Injectable\`, binds all registered classes
to the container, and returns a \`DecoratorContainer\`.

\`\`\`ts
import { createContainer } from 'beebear';
import { withDecorators } from '@beebear-plugins/di-decorators';

// Import decorated classes to trigger registration
import './domain/use-cases/create-order.use-case';
import './infrastructure/persistence/prisma-order-repository';

const baseContainer = createContainer();
// Bind non-decorated dependencies manually
baseContainer.bind(PrismaToken, () => new PrismaClient());

const container = withDecorators(baseContainer);
// container now has all @Injectable bindings applied
\`\`\`

### DecoratorContainer

Returned by \`withDecorators()\`. Provides \`resolve\`, \`has\`, \`validate\`, and
\`createScope\` — but **not** \`bind\`. All manual bindings must be done on the base
container before calling \`withDecorators\`.

\`\`\`ts
interface DecoratorContainer {
  resolve<T>(token: InjectionToken<T>): T;
  has<T>(token: InjectionToken<T>): boolean;
  validate(): void;
  createScope(): Container;
}
\`\`\`

### clearRegistry()

Clears the global decorator registry. Use in tests to ensure a clean state:

\`\`\`ts
import { clearRegistry } from '@beebear-plugins/di-decorators';

beforeEach(() => {
  clearRegistry();
});
\`\`\`

## Lifecycle Options

Pass lifecycle as the second argument to \`@Injectable\`:

\`\`\`ts
@Injectable(MyToken, { lifecycle: 'transient' })
export class MyService { ... }

@Injectable(MyToken, { lifecycle: 'scoped' })
export class MyScopedService { ... }

// Default is 'singleton'
@Injectable(MyToken)
export class MySingleton { ... }
\`\`\`

## Complete Example

\`\`\`ts
// domain/ports/outbound/email-service.port.ts
import { Port } from 'beebear';

export interface EmailService {
  send(to: string, subject: string, body: string): Promise<void>;
}
export const EmailService = Port<EmailService>('EmailService');

// infrastructure/services/sendgrid-email.service.ts
import { Injectable } from '@beebear-plugins/di-decorators';
import { EmailService } from '../../domain/ports/outbound/email-service.port';

@Injectable(EmailService)
export class SendGridEmailService implements EmailService {
  async send(to: string, subject: string, body: string): Promise<void> {
    // SendGrid API call
  }
}

// main.ts
import { createContainer, createHexApp } from 'beebear';
import { withDecorators } from '@beebear-plugins/di-decorators';
import './infrastructure/services/sendgrid-email.service';

const container = withDecorators(createContainer());
container.validate();

const hex = createHexApp({ container });
\`\`\`

## When to Use Decorators vs Manual Binding

- **Use decorators** when you prefer annotation-style DI and want less boilerplate
  in the wiring file.
- **Use manual binding** when you want full explicit control, need to avoid
  \`experimentalDecorators\`, or are writing library code where implicit globals are
  undesirable.
- You can mix both: manually bind some tokens, decorate others, then call
  \`withDecorators()\` to merge them.
`;
