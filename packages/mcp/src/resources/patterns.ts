export const PATTERNS = `# beebear Patterns

## 1. Port Definition

Ports are TypeScript interfaces with co-located runtime tokens. Inbound ports define
what the outside world can ask the domain to do. Outbound ports define what the domain
needs from infrastructure.

\`\`\`ts
// src/domain/ports/inbound/create-order.port.ts
import { Port } from 'beebear';
import type { UseCase } from 'beebear';

export interface CreateOrderInput {
  customerId: string;
  items: { productId: string; quantity: number }[];
}
export interface CreateOrderOutput {
  orderId: string;
}
export type CreateOrderPort = UseCase<CreateOrderInput, CreateOrderOutput>;
export const CreateOrderPort = Port<CreateOrderPort>('CreateOrder');

// src/domain/ports/outbound/order-repository.port.ts
import { Port } from 'beebear';

export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
}
export const OrderRepository = Port<OrderRepository>('OrderRepository');
\`\`\`

## 2. Use Case Implementation

Use cases implement inbound ports and depend on outbound ports. They contain
only domain logic — no framework imports.

\`\`\`ts
// src/domain/use-cases/create-order.use-case.ts
import type { CreateOrderPort, CreateOrderInput, CreateOrderOutput } from '../ports/inbound/create-order.port';
import type { OrderRepository } from '../ports/outbound/order-repository.port';
import { NotFoundError } from 'beebear';

export class CreateOrderUseCase implements CreateOrderPort {
  constructor(private readonly orderRepo: OrderRepository) {}

  async execute(input: CreateOrderInput): Promise<CreateOrderOutput> {
    if (input.items.length === 0) {
      throw new NotFoundError('Order must have at least one item');
    }
    const order = Order.create(input.customerId, input.items);
    await this.orderRepo.save(order);
    return { orderId: order.id };
  }
}
\`\`\`

## 3. Adapter Implementation

Driven adapters implement outbound port interfaces and live in infrastructure.

\`\`\`ts
// src/infrastructure/persistence/prisma-order-repository.ts
import type { OrderRepository } from '../../domain/ports/outbound/order-repository.port';
import { PrismaClient } from '@prisma/client';

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(order: Order): Promise<void> {
    await this.prisma.order.create({ data: order.toPersistence() });
  }
  async findById(id: string): Promise<Order | null> {
    const row = await this.prisma.order.findUnique({ where: { id } });
    return row ? Order.fromPersistence(row) : null;
  }
}
\`\`\`

## 4. Container Binding

\`\`\`ts
import { createContainer, Token } from 'beebear';
import { OrderRepository } from './domain/ports/outbound/order-repository.port';
import { CreateOrderPort } from './domain/ports/inbound/create-order.port';
import { PrismaOrderRepository } from './infrastructure/persistence/prisma-order-repository';
import { CreateOrderUseCase } from './domain/use-cases/create-order.use-case';
import { PrismaClient } from '@prisma/client';

const PrismaToken = Token<PrismaClient>('PrismaClient');
const container = createContainer();

// Factory form — full control
container.bind(PrismaToken, () => new PrismaClient());

// Factory form — resolve dependencies from container
container.bind(OrderRepository, (c) => new PrismaOrderRepository(c.resolve(PrismaToken)));

// Constructor shorthand — deps array maps to constructor params
container.bind(CreateOrderPort, CreateOrderUseCase, [OrderRepository]);

// Transient lifecycle
container.bind(SomeToken, SomeClass, [], { lifecycle: 'transient' });

// Validate all bindings at startup (catches missing deps early)
container.validate();
\`\`\`

## 5. HTTP Routes with httpAdapter

\`\`\`ts
import express from 'express';
import { createHexApp } from 'beebear';
import { CreateOrderPort } from './domain/ports/inbound/create-order.port';

const app = express();
const hex = createHexApp({ container, framework: 'express' });

// toInput extracts use case input from the request
app.post('/orders', hex.httpAdapter(CreateOrderPort, {
  toInput: (req) => ({
    customerId: req.body.customerId,
    items: req.body.items,
  }),
}));

// Method defaults: POST -> 201, DELETE -> 204, else -> 200
// Override with status option:
app.get('/orders/:id', hex.httpAdapter(GetOrderPort, {
  toInput: (req) => ({ orderId: req.params.id }),
  status: 200,
}));
\`\`\`

## 6. Lifecycle Hooks

\`\`\`ts
const hex = createHexApp({
  container,
  hooks: {
    beforeExecute(ctx) {
      ctx.state.startTime = Date.now();
      console.log(\\\`Executing \\\${ctx.tokenName} with input:\\\`, ctx.input);
    },
    afterExecute(ctx) {
      console.log(\\\`\\\${ctx.tokenName} completed in \\\${ctx.duration}ms\\\`);
    },
    onError(ctx) {
      console.error(\\\`\\\${ctx.tokenName} failed after \\\${ctx.duration}ms:\\\`, ctx.error);
    },
  },
});
\`\`\`

The \`state\` object is shared across all three hooks for a single execution, allowing
\`beforeExecute\` to store data that \`afterExecute\` or \`onError\` reads.

## 7. Third-Party DI (Escape Hatch)

If you already use another DI container, wrap it to match beebear's Container interface:

\`\`\`ts
import { createHexApp } from 'beebear';
import type { Container } from 'beebear';

function wrapExternalContainer(external: ExternalDI): Container {
  return {
    bind: (token, factory) => external.register(token, factory),
    resolve: (token) => external.get(token),
    has: (token) => external.has(token),
    validate: () => { /* no-op or custom logic */ },
    createScope: () => wrapExternalContainer(external.createChild()),
  };
}

const hex = createHexApp({ container: wrapExternalContainer(myExternalDI) });
\`\`\`
`;
