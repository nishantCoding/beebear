export const HTTP_ADAPTERS = `# beebear HTTP Adapters

## Overview

beebear uses a **strategy pattern** for HTTP framework support. The framework strategy
is resolved once at startup — no branching at request time. Supported built-in frameworks:
Express, Fastify, and Hono.

## Framework Selection

\`\`\`ts
import { createHexApp } from 'beebear';

// Explicit selection (recommended)
const hex = createHexApp({ container, framework: 'express' });
const hex = createHexApp({ container, framework: 'fastify' });
const hex = createHexApp({ container, framework: 'hono' });

// Auto-detection: beebear calls require.resolve() at startup
// to find which HTTP framework is installed
const hex = createHexApp({ container });
\`\`\`

## httpAdapter Usage

\`httpAdapter\` creates a framework-native request handler that extracts input, runs
the use case, and sends the response.

\`\`\`ts
interface HttpAdapterOptions<TInput> {
  toInput: (req: any) => TInput;   // always required
  status?: number;                  // override default status code
}
\`\`\`

### Express Example

\`\`\`ts
import express from 'express';
import { createHexApp } from 'beebear';
import { CreateOrderPort } from './domain/ports/inbound/create-order.port';
import { GetOrderPort } from './domain/ports/inbound/get-order.port';
import { DeleteOrderPort } from './domain/ports/inbound/delete-order.port';

const app = express();
app.use(express.json());

const hex = createHexApp({ container, framework: 'express' });

app.post('/orders', hex.httpAdapter(CreateOrderPort, {
  toInput: (req) => ({ customerId: req.body.customerId, items: req.body.items }),
}));

app.get('/orders/:id', hex.httpAdapter(GetOrderPort, {
  toInput: (req) => ({ orderId: req.params.id }),
}));

app.delete('/orders/:id', hex.httpAdapter(DeleteOrderPort, {
  toInput: (req) => ({ orderId: req.params.id }),
}));
\`\`\`

### Fastify Example

\`\`\`ts
import Fastify from 'fastify';
import { createHexApp } from 'beebear';

const fastify = Fastify();
const hex = createHexApp({ container, framework: 'fastify' });

fastify.post('/orders', hex.httpAdapter(CreateOrderPort, {
  toInput: (req) => ({ customerId: req.body.customerId, items: req.body.items }),
}));
\`\`\`

### Hono Example

\`\`\`ts
import { Hono } from 'hono';
import { createHexApp } from 'beebear';

const app = new Hono();
const hex = createHexApp({ container, framework: 'hono' });

app.post('/orders', hex.httpAdapter(CreateOrderPort, {
  toInput: (c) => ({ customerId: c.req.json().customerId }),
}));
\`\`\`

## Default Status Codes by Method

| HTTP Method | Default Status |
|-------------|---------------|
| POST        | 201           |
| DELETE      | 204           |
| GET         | 200           |
| PUT         | 200           |
| PATCH       | 200           |

Override with the \`status\` option:

\`\`\`ts
app.post('/orders', hex.httpAdapter(CreateOrderPort, {
  toInput: (req) => req.body,
  status: 200,   // override POST's default 201
}));
\`\`\`

## Framework-Agnostic Fallback (hex.execute)

Use \`hex.execute()\` when you need to run a use case outside of HTTP — in tests,
CLI scripts, message consumers, or WebSocket handlers:

\`\`\`ts
const result = await hex.execute(CreateOrderPort, {
  customerId: '123',
  items: [{ productId: 'abc', quantity: 2 }],
});

if (result.success) {
  console.log('Order created:', result.data.orderId);
} else {
  console.error(result.error.message, result.statusCode);
}
\`\`\`

## Custom FrameworkStrategy

Implement a custom strategy for unsupported frameworks or non-HTTP transports:

\`\`\`ts
import { createHexApp } from 'beebear';

const customStrategy = {
  createHandler(core, options) {
    // core.execute(input) runs the use case and returns ExecuteResult
    // options.toInput extracts input from the framework's request object
    // options.status is the desired HTTP status code
    return async (frameworkReq, frameworkRes) => {
      const input = options.toInput(frameworkReq);
      const result = await core.execute(input);
      if (result.success) {
        frameworkRes.status(options.status).json(result.data);
      } else {
        frameworkRes.status(result.statusCode).json(result.error);
      }
    };
  },
};

const hex = createHexApp({ container, framework: customStrategy });
\`\`\`

## Payload Validation

Structural/payload validation (Zod, Joi, etc.) happens in middleware **before**
\`httpAdapter\`. It is a boundary concern, not the framework's job:

\`\`\`ts
import { z } from 'zod';

const CreateOrderSchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().positive() })),
});

app.post('/orders',
  (req, res, next) => {
    const parsed = CreateOrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    req.body = parsed.data;
    next();
  },
  hex.httpAdapter(CreateOrderPort, { toInput: (req) => req.body }),
);
\`\`\`
`;
