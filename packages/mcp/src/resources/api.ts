export const API = `# beebear API Reference

## Token & Port

\`\`\`ts
type InjectionToken<T> = symbol & { readonly __type?: T };

function Token<T>(name: string): InjectionToken<T>;
function Port<T>(name: string): InjectionToken<T>;
\`\`\`

- \`Token<T>(name)\` creates a unique branded symbol for DI. Throws if \`name\` is already used.
- \`Port<T>(name)\` is a semantic alias for \`Token\`. Use \`Port\` for hexagonal ports, \`Token\` for general dependencies.
- The phantom type \`T\` enables type-safe resolution — \`container.resolve(token)\` returns \`T\`.

## Container

\`\`\`ts
function createContainer(): Container;

interface Container {
  bind<T>(token: InjectionToken<T>, factory: (c: Container) => T, options?: BindOptions): void;
  bind<T>(token: InjectionToken<T>, constructor: new (...args: any[]) => T, deps: InjectionToken[], options?: BindOptions): void;
  resolve<T>(token: InjectionToken<T>): T;
  has<T>(token: InjectionToken<T>): boolean;
  validate(): void;
  createScope(): Container;
}

interface BindOptions {
  lifecycle?: 'singleton' | 'transient' | 'scoped';
}
\`\`\`

- \`bind(token, factory)\` — factory receives the container for resolving dependencies.
- \`bind(token, Constructor, [depTokens])\` — shorthand, container resolves deps and passes to constructor.
- \`resolve(token)\` — returns the instance. Singleton by default (cached after first resolve).
- \`has(token)\` — check if a binding exists.
- \`validate()\` — throws if any binding has unresolvable dependencies. Call at startup.
- \`createScope()\` — child container for scoped lifecycles.

## Errors

\`\`\`ts
class BusinessError extends Error {
  code: string;
  name: string;
  constructor(message: string, code?: string);
}

class ValidationError extends BusinessError {}   // 400
class NotFoundError extends BusinessError {}      // 404
class ConflictError extends BusinessError {}      // 409
class UnauthorizedError extends BusinessError {}  // 401
class ForbiddenError extends BusinessError {}     // 403
\`\`\`

All error classes accept \`(message: string, code?: string)\`. The \`code\` defaults to a
snake_case derivation of the class name (e.g. \`VALIDATION_ERROR\`).

## UseCase

\`\`\`ts
interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
\`\`\`

## createHexApp

\`\`\`ts
function createHexApp(options: HexAppOptions): HexApp;

interface HexAppOptions {
  container: Container;
  errorMap?: Record<string, number>;
  framework?: BuiltInFramework | FrameworkStrategy;
  hooks?: HexAppHooks;
}

type BuiltInFramework = 'express' | 'fastify' | 'hono';

interface HexApp {
  execute<TInput, TOutput>(token: InjectionToken<UseCase<TInput, TOutput>>, input: TInput): Promise<ExecuteResult<TOutput>>;
  httpAdapter<TInput, TOutput>(token: InjectionToken<UseCase<TInput, TOutput>>, options: HttpAdapterOptions<TInput>): any;
}

interface HttpAdapterOptions<TInput> {
  toInput: (req: any) => TInput;
  status?: number;
}

type ExecuteResult<T> =
  | { success: true; data: T }
  | { success: false; error: { message: string; code: string }; statusCode: number };
\`\`\`

Default status by HTTP method: POST returns 201, DELETE returns 204, all others return 200.

Default error-to-status map: BusinessError 400, ValidationError 400, NotFoundError 404,
ConflictError 409, UnauthorizedError 401, ForbiddenError 403.

## Lifecycle Hooks

\`\`\`ts
interface HookContext {
  token: symbol;
  tokenName: string;
  input: unknown;
  result?: ExecuteResult<unknown>;
  error?: unknown;
  duration: number;
  state: Record<string, unknown>;
}

interface HexAppHooks {
  beforeExecute?: (context: HookContext) => void;
  afterExecute?: (context: HookContext) => void;
  onError?: (context: HookContext) => void;
}
\`\`\`

- \`state\` is a mutable bag shared across all three hooks for a single execution.
- \`duration\` is 0 in \`beforeExecute\`, measured in ms in \`afterExecute\` and \`onError\`.
`;
