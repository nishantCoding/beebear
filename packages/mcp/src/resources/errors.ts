export const ERRORS = `# beebear Error Handling

## Error Hierarchy

\`\`\`
Error
└── BusinessError          (base, default 400)
    ├── ValidationError    (400 — invalid input)
    ├── NotFoundError      (404 — resource not found)
    ├── ConflictError      (409 — state conflict)
    ├── UnauthorizedError  (401 — not authenticated)
    └── ForbiddenError     (403 — not authorized)
\`\`\`

All error classes share the same constructor signature:

\`\`\`ts
constructor(message: string, code?: string)
\`\`\`

The \`code\` property defaults to a snake_case derivation of the class name (e.g.
\`VALIDATION_ERROR\`). The \`name\` property is set to the class name automatically.

## When to Use Each Error

| Error Class        | HTTP Status | When to Throw                                        |
|--------------------|-------------|------------------------------------------------------|
| BusinessError      | 400         | General domain rule violation                        |
| ValidationError    | 400         | Input fails business validation inside the use case  |
| NotFoundError      | 404         | Requested entity does not exist                      |
| ConflictError      | 409         | Operation conflicts with current state (duplicates)  |
| UnauthorizedError  | 401         | Caller identity is unknown or token is invalid       |
| ForbiddenError     | 403         | Caller is authenticated but lacks permission         |

## Default Error-to-Status Map

\`createHexApp\` ships with a built-in map:

\`\`\`ts
{
  BusinessError: 400,
  ValidationError: 400,
  NotFoundError: 404,
  ConflictError: 409,
  UnauthorizedError: 401,
  ForbiddenError: 403,
}
\`\`\`

Unknown errors (not in the map) result in HTTP 500.

## Custom Error Subclasses

Extend any built-in error to create domain-specific errors:

\`\`\`ts
import { ConflictError } from 'beebear';

export class OrderAlreadyShippedError extends ConflictError {
  constructor(orderId: string) {
    super(\\\`Order \\\${orderId} has already been shipped\\\`, 'ORDER_ALREADY_SHIPPED');
  }
}
\`\`\`

Custom subclasses automatically inherit the parent's HTTP status mapping. An
\`OrderAlreadyShippedError\` maps to 409 because it extends \`ConflictError\`.

## Overriding the Error Map

Use the \`errorMap\` option in \`createHexApp\` to add or override mappings:

\`\`\`ts
import { createHexApp } from 'beebear';

const hex = createHexApp({
  container,
  errorMap: {
    RateLimitError: 429,
    PaymentRequiredError: 402,
    // Override a built-in:
    BusinessError: 422,
  },
});
\`\`\`

The map key is the error class \`name\` property (the class name string). beebear checks
the error's prototype chain, so subclass mappings take priority over parent mappings.

## Usage in Use Cases

\`\`\`ts
import { NotFoundError, ValidationError } from 'beebear';

export class GetOrderUseCase implements GetOrderPort {
  constructor(private readonly orderRepo: OrderRepository) {}

  async execute(input: { orderId: string }): Promise<Order> {
    if (!input.orderId) {
      throw new ValidationError('orderId is required');
    }
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) {
      throw new NotFoundError(\\\`Order \\\${input.orderId} not found\\\`);
    }
    return order;
  }
}
\`\`\`

## ExecuteResult Shape

When errors are thrown inside \`hex.execute()\` or \`hex.httpAdapter()\`, they are caught
and mapped:

\`\`\`ts
// Success
{ success: true, data: { orderId: '123' } }

// Error
{ success: false, error: { message: 'Order not found', code: 'NOT_FOUND_ERROR' }, statusCode: 404 }
\`\`\`

The \`httpAdapter\` sends the JSON error response with the mapped status code automatically.
\`hex.execute()\` returns the \`ExecuteResult\` object for you to handle programmatically.
`;
