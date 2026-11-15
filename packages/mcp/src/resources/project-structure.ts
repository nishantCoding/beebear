export const PROJECT_STRUCTURE = `# beebear Project Structure

## Standard Layout

\`\`\`
src/
├── domain/
│   ├── models/              # Domain objects (plain TS, no framework imports)
│   ├── ports/
│   │   ├── inbound/         # Driving ports (use case interfaces + tokens)
│   │   └── outbound/        # Driven ports (repo/service interfaces + tokens)
│   ├── use-cases/           # Use case implementations
│   └── errors/              # Domain error subclasses
└── infrastructure/
    ├── persistence/         # Driven adapters (Prisma, Mongo, in-memory)
    ├── http/                # Driving adapters (controllers/routes)
    └── services/            # Driven adapters (email, payment, etc.)
\`\`\`

## What Goes Where

### domain/models/
Plain TypeScript classes and types representing domain concepts. No framework imports,
no database annotations. These are the core business objects.

\`\`\`ts
// domain/models/order.ts
export class Order {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public readonly items: OrderItem[],
    public readonly status: OrderStatus,
  ) {}
}
\`\`\`

### domain/ports/inbound/
Driving port interfaces that define what the outside world can ask the domain to do.
Each file exports a TypeScript interface (extending \`UseCase<TInput, TOutput>\`) and
a co-located \`Port<T>()\` token.

\`\`\`ts
// domain/ports/inbound/create-order.port.ts
import { Port } from 'beebear';
import type { UseCase } from 'beebear';

export interface CreateOrderInput { customerId: string; items: Item[] }
export interface CreateOrderOutput { orderId: string }
export type CreateOrderPort = UseCase<CreateOrderInput, CreateOrderOutput>;
export const CreateOrderPort = Port<CreateOrderPort>('CreateOrder');
\`\`\`

### domain/ports/outbound/
Driven port interfaces that define what the domain needs from infrastructure (repos,
services). The domain calls these; infrastructure implements them.

\`\`\`ts
// domain/ports/outbound/order-repository.port.ts
import { Port } from 'beebear';

export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
}
export const OrderRepository = Port<OrderRepository>('OrderRepository');
\`\`\`

### domain/use-cases/
Use case classes that implement inbound ports. They receive outbound ports via
constructor injection and contain only business logic.

### domain/errors/
Custom domain error subclasses extending beebear's error hierarchy. Example:
\`OrderAlreadyShippedError extends ConflictError\`.

### infrastructure/persistence/
Driven adapter implementations for data persistence. Implements outbound repository
ports using Prisma, Drizzle, Mongoose, or plain SQL.

### infrastructure/http/
Driving adapters — Express/Fastify/Hono route files that use \`hex.httpAdapter()\` to
connect HTTP endpoints to use case tokens.

\`\`\`ts
// infrastructure/http/order.routes.ts
import { Router } from 'express';
import { CreateOrderPort } from '../../domain/ports/inbound/create-order.port';

export function orderRoutes(hex: HexApp): Router {
  const router = Router();
  router.post('/', hex.httpAdapter(CreateOrderPort, {
    toInput: (req) => ({ customerId: req.body.customerId, items: req.body.items }),
  }));
  return router;
}
\`\`\`

### infrastructure/services/
Driven adapters for external services (email providers, payment gateways, etc.).
Implements outbound service ports.

## Key Rules

1. **domain/ never imports from infrastructure/** — dependencies point inward.
2. **Ports are owned by the domain** — defined in domain/ports, implemented in infrastructure.
3. **Use cases depend on port interfaces**, not concrete implementations.
4. **Container wiring** happens at the app entry point (e.g., \`main.ts\` or \`app.ts\`),
   where you bind concrete adapters to port tokens.
5. **Validation middleware** (Zod, Joi) runs in infrastructure/http before \`httpAdapter\`.
`;
