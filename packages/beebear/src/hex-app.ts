import type { Container } from './container.js';
import type { InjectionToken } from './token.js';
import type { UseCase } from './use-case.js';
import { BusinessError } from './errors.js';

export type ExecuteResult<T> =
  | { success: true; data: T }
  | { success: false; error: { message: string; code: string }; statusCode: number };

export interface RouteOptions {
  resolveStatus: (method: string) => number;
}

export interface FrameworkStrategy {
  createHandler(
    executeRoute: (req: any) => Promise<ExecuteResult<any>>,
    options: RouteOptions,
  ): any;
}

export interface HttpAdapterOptions<TInput> {
  toInput: (req: any) => TInput;
  status?: number;
}

export type BuiltInFramework = 'express' | 'fastify' | 'hono';

export interface HookContext {
  token: symbol;
  tokenName: string;
  input: unknown;
  result?: ExecuteResult<unknown>;
  error?: unknown;
  duration: number;
  state: Record<string, unknown>;
}

export interface HexAppHooks {
  beforeExecute?: (context: HookContext) => void;
  afterExecute?: (context: HookContext) => void;
  onError?: (context: HookContext) => void;
}

export interface HexAppOptions {
  container: Container;
  errorMap?: Record<string, number>;
  framework?: BuiltInFramework | FrameworkStrategy;
  hooks?: HexAppHooks;
}

export interface HexApp {
  execute<TInput, TOutput>(
    token: InjectionToken<UseCase<TInput, TOutput>>,
    input: TInput,
  ): Promise<ExecuteResult<TOutput>>;

  httpAdapter<TInput, TOutput>(
    token: InjectionToken<UseCase<TInput, TOutput>>,
    options: HttpAdapterOptions<TInput>,
  ): any;
}

const DEFAULT_ERROR_MAP: Record<string, number> = {
  BusinessError: 400,
  ValidationError: 400,
  NotFoundError: 404,
  ConflictError: 409,
  UnauthorizedError: 401,
  ForbiddenError: 403,
};

const METHOD_DEFAULTS: Record<string, number> = {
  POST: 201,
  DELETE: 204,
};

const BUILT_IN_STRATEGIES: Record<string, FrameworkStrategy> = {
  express: {
    createHandler(executeRoute, options) {
      return async (req: any, res: any, next: any) => {
        try {
          const result = await executeRoute(req);
          if (!result.success) {
            return res.status(result.statusCode).json(result.error);
          }
          const status = options.resolveStatus(req.method);
          if (status === 204) return res.status(204).send();
          res.status(status).json(result.data);
        } catch (err) {
          next(err);
        }
      };
    },
  },
  fastify: {
    createHandler(executeRoute, options) {
      return async (request: any, reply: any) => {
        const result = await executeRoute(request);
        if (!result.success) {
          return reply.status(result.statusCode).send(result.error);
        }
        const status = options.resolveStatus(request.method);
        if (status === 204) return reply.status(204).send();
        reply.status(status).send(result.data);
      };
    },
  },
  hono: {
    createHandler(executeRoute, options) {
      return async (c: any) => {
        const result = await executeRoute(c.req);
        if (!result.success) {
          return c.json(result.error, result.statusCode);
        }
        const status = options.resolveStatus(c.req.method);
        if (status === 204) return c.body(null, 204);
        return c.json(result.data, status);
      };
    },
  },
};

export function createHexApp(options: HexAppOptions): HexApp {
  const { container } = options;
  const errorMap = { ...DEFAULT_ERROR_MAP, ...options.errorMap };
  const hooks = options.hooks;

  // Resolve framework strategy once at startup
  let strategy: FrameworkStrategy | undefined;

  if (typeof options.framework === 'string') {
    strategy = BUILT_IN_STRATEGIES[options.framework];
    if (!strategy) {
      throw new Error(
        `Unknown framework: "${options.framework}". Supported: express, fastify, hono. For other frameworks, pass a FrameworkStrategy object.`,
      );
    }
  } else if (options.framework) {
    strategy = options.framework;
  }

  const hex: HexApp = {
    async execute<TInput, TOutput>(
      token: InjectionToken<UseCase<TInput, TOutput>>,
      input: TInput,
    ): Promise<ExecuteResult<TOutput>> {
      const context: HookContext = {
        token,
        tokenName: token.description ?? 'unknown',
        input,
        result: undefined,
        error: undefined,
        duration: 0,
        state: {},
      };

      if (hooks?.beforeExecute) {
        hooks.beforeExecute(context);
      }

      const start = Date.now();

      try {
        const useCase = container.resolve(token);
        const data = await useCase.execute(input);
        const result: ExecuteResult<TOutput> = { success: true, data };

        context.result = result;
        context.duration = Date.now() - start;

        if (hooks?.afterExecute) {
          hooks.afterExecute(context);
        }

        return result;
      } catch (err) {
        context.duration = Date.now() - start;
        context.error = err;

        if (hooks?.onError) {
          hooks.onError(context);
        }

        if (err instanceof BusinessError) {
          const result: ExecuteResult<TOutput> = {
            success: false,
            error: { message: err.message, code: err.code },
            statusCode: errorMap[err.name] ?? 400,
          };
          context.result = result;

          if (hooks?.afterExecute) {
            hooks.afterExecute(context);
          }

          return result;
        }

        if (hooks?.afterExecute) {
          hooks.afterExecute(context);
        }

        throw err;
      }
    },

    httpAdapter<TInput, TOutput>(
      token: InjectionToken<UseCase<TInput, TOutput>>,
      adapterOptions: HttpAdapterOptions<TInput>,
    ): any {
      if (!strategy) {
        throw new Error(
          'httpAdapter() requires a framework strategy. Provide one via createHexApp({ framework: ... })',
        );
      }

      const executeRoute = async (req: any): Promise<ExecuteResult<TOutput>> => {
        const input = adapterOptions.toInput(req);
        return await hex.execute(token, input);
      };

      const resolveStatus = (method: string): number =>
        adapterOptions.status ?? METHOD_DEFAULTS[method] ?? 200;

      return strategy.createHandler(executeRoute, { resolveStatus });
    },
  };

  return hex;
}
