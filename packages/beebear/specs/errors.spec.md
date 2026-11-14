# Spec: Business Error Base Classes

## Purpose

beebear ships a set of base error classes that represent common business-level
failure cases. These serve two purposes:

1. **Standardised error hierarchy** — developers extend these instead of
   inventing their own base classes. Every beebear app speaks the same error
   language.
2. **Error-to-HTTP mapping** — `createHexApp()` uses the error class name
   to look up the HTTP status code from the global `errorMap`. The base
   classes ship with sensible defaults so developers don't have to map
   common errors manually.

These are business errors — they live inside the hexagon. They have zero
dependency on HTTP, frameworks, or infrastructure.

---

## Public API

### `BusinessError` (base class)

The root of all business errors. All other beebear errors extend this.

```ts
export class BusinessError extends Error {
  readonly code: string;

  constructor(message: string, code?: string);
}
```

- `message` — human-readable error description
- `code` — machine-readable error code. Defaults to the class name
  (e.g., `'BusinessError'`, `'ValidationError'`). Can be overridden
  for app-specific codes like `'USER_ALREADY_EXISTS'`.
- `name` — set to the class name automatically (standard `Error` behavior)

### `ValidationError`

Input data fails business rule validation.

```ts
export class ValidationError extends BusinessError {
  constructor(message: string, code?: string);
}
```

Default HTTP mapping: **400**

Examples: missing required field, invalid email format, negative quantity,
string too long.

### `NotFoundError`

Requested entity does not exist.

```ts
export class NotFoundError extends BusinessError {
  constructor(message: string, code?: string);
}
```

Default HTTP mapping: **404**

Examples: user not found, order not found, product not found.

### `ConflictError`

Operation conflicts with current state.

```ts
export class ConflictError extends BusinessError {
  constructor(message: string, code?: string);
}
```

Default HTTP mapping: **409**

Examples: email already registered, duplicate order, version conflict.

### `UnauthorizedError`

Caller is not authenticated.

```ts
export class UnauthorizedError extends BusinessError {
  constructor(message: string, code?: string);
}
```

Default HTTP mapping: **401**

Examples: missing or invalid token, expired session.

### `ForbiddenError`

Caller is authenticated but lacks permission.

```ts
export class ForbiddenError extends BusinessError {
  constructor(message: string, code?: string);
}
```

Default HTTP mapping: **403**

Examples: non-admin trying to delete users, accessing another user's data.

---

## Behavior Rules

1. **All errors extend `BusinessError`.**
   `ValidationError`, `NotFoundError`, etc. are all subclasses of
   `BusinessError`. Code that catches `BusinessError` catches all of them.

2. **All errors extend `Error`.**
   `BusinessError` extends the native `Error` class. Stack traces, `instanceof`,
   and `error.message` all work as expected.

3. **`code` defaults to the class name.**
   ```ts
   new BusinessError('something broke').code        // 'BusinessError'
   new ValidationError('bad input').code           // 'ValidationError'
   new NotFoundError('not found').code             // 'NotFoundError'
   ```

4. **`code` can be overridden.**
   ```ts
   new ConflictError('email taken', 'USER_ALREADY_EXISTS').code
   // 'USER_ALREADY_EXISTS'
   ```

5. **`name` matches the class name.**
   ```ts
   new ValidationError('bad input').name           // 'ValidationError'
   new NotFoundError('not found').name             // 'NotFoundError'
   ```
   This is standard `Error` behavior — `name` is set in the constructor.

6. **`instanceof` works through the hierarchy.**
   ```ts
   const err = new ValidationError('bad');
   err instanceof ValidationError  // true
   err instanceof BusinessError      // true
   err instanceof Error            // true
   ```

7. **Stack traces are captured.**
   All errors capture a stack trace at the point of construction, just
   like native `Error`.

8. **Errors are serializable to JSON.**
   ```ts
   const err = new NotFoundError('User not found', 'USER_NOT_FOUND');
   JSON.stringify({ message: err.message, code: err.code });
   // '{"message":"User not found","code":"USER_NOT_FOUND"}'
   ```
   The errors don't implement `toJSON()` — the consumer picks which
   properties to serialize. The point is that `message` and `code`
   are plain strings, not symbols or complex objects.

---

## Extending for App-Specific Errors

Developers create their own business errors by extending the base classes:

```ts
export class UserAlreadyExistsError extends ConflictError {
  constructor(email: string) {
    super(`User with email "${email}" already exists`, 'USER_ALREADY_EXISTS');
  }
}

export class InsufficientBalanceError extends BusinessError {
  constructor(required: number, available: number) {
    super(
      `Insufficient balance: required ${required}, available ${available}`,
      'INSUFFICIENT_BALANCE',
    );
  }
}
```

These custom errors work with the `errorMap` in `createHexApp()`:

```ts
const hex = createHexApp({
  container,
  errorMap: {
    // Base errors have sensible defaults, but can be overridden:
    // ValidationError: 400,  (default)
    // NotFoundError: 404,    (default)
    // ConflictError: 409,    (default)

    // App-specific errors need explicit mapping:
    UserAlreadyExistsError: 409,
    InsufficientBalanceError: 422,
  },
});
```

---

## Default Error Map

beebear ships a default mapping for its base classes. Developers can
override any of these in their `errorMap`.

| Error class | Default HTTP status |
|-------------|-------------------|
| `BusinessError` | 400 |
| `ValidationError` | 400 |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `UnauthorizedError` | 401 |
| `ForbiddenError` | 403 |

This default map is used by `createHexApp()` and `httpAdapter()`. It is
merged with the developer's custom `errorMap` (developer overrides win).

---

## Non-Goals

- No HTTP awareness in error classes (no `statusCode` property)
- No error serialization (`toJSON`) — the consumer decides the format
- No error aggregation (collecting multiple validation errors into one)
- No i18n / translation support
- No error metadata beyond `message` and `code` (no `details` object,
  no `field` property — developers add these in their subclasses if needed)

---

## Usage Example

```ts
import { BusinessError, ValidationError, NotFoundError } from 'beebear';

// In a use case
class RegisterUserService {
  async execute(input: { email: string; name: string }) {
    if (!input.email.includes('@')) {
      throw new ValidationError('Invalid email format');
    }

    const existing = await this.repo.findByEmail(input.email);
    if (existing) {
      throw new ConflictError(`Email "${input.email}" already registered`);
    }

    // ...
  }
}

// Catching errors
try {
  await registerUser.execute({ email: 'bad', name: 'Test' });
} catch (error) {
  if (error instanceof BusinessError) {
    // All business errors caught here
    console.log(error.message);  // 'Invalid email format'
    console.log(error.code);     // 'ValidationError'
    console.log(error.name);     // 'ValidationError'
  }
}
```
