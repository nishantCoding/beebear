import type { InjectionToken, Container } from 'beebear';

// --- Metadata keys (private symbols, no reflect-metadata) ---

const INJECT_METADATA = Symbol('beebear:inject');

// --- Global registry ---

interface RegistryEntry {
  token: InjectionToken<any>;
  target: new (...args: any[]) => any;
  lifecycle: 'singleton' | 'transient' | 'scoped';
}

const registry: RegistryEntry[] = [];

// --- DecoratorContainer interface ---

export interface DecoratorContainer {
  resolve<T>(token: InjectionToken<T>): T;
  has<T>(token: InjectionToken<T>): boolean;
  validate(): void;
  createScope(): DecoratorContainer;
}

// --- @Injectable ---

export function Injectable<T>(
  token: InjectionToken<T>,
  options?: { lifecycle?: 'singleton' | 'transient' | 'scoped' },
): ClassDecorator {
  if (!token) {
    throw new Error('@Injectable requires a token argument');
  }

  return (target) => {
    registry.push({
      token,
      target: target as unknown as new (...args: any[]) => any,
      lifecycle: options?.lifecycle ?? 'singleton',
    });
    return target;
  };
}

// --- @Inject ---

interface InjectEntry {
  paramIndex: number;
  token: InjectionToken<any>;
}

export function Inject<T>(
  token: InjectionToken<T>,
): ParameterDecorator {
  return (target: Object, _propertyKey: string | symbol | undefined, parameterIndex: number) => {
    const existing: InjectEntry[] =
      (target as any)[INJECT_METADATA] ?? [];
    existing.push({ paramIndex: parameterIndex, token });
    (target as any)[INJECT_METADATA] = existing;
  };
}

// --- withDecorators ---

function wrapContainer(inner: Container): DecoratorContainer {
  return {
    resolve: <T>(token: InjectionToken<T>) => inner.resolve(token),
    has: <T>(token: InjectionToken<T>) => inner.has(token),
    validate: () => inner.validate(),
    createScope: () => wrapContainer(inner.createScope()),
  };
}

export function withDecorators(container: Container): DecoratorContainer {
  // Check for duplicate tokens
  const seen = new Map<symbol, string>();
  for (const entry of registry) {
    const sym = entry.token as symbol;
    const existing = seen.get(sym);
    if (existing) {
      const name = sym.description ?? '<unknown>';
      throw new Error(`Duplicate @Injectable for token "${name}"`);
    }
    seen.set(sym, (entry.target as Function).name);
  }

  // Bind each registered class
  for (const entry of registry) {
    const { token, target, lifecycle } = entry;
    const ctorLength = target.length;

    // Read @Inject metadata
    const injectMeta: InjectEntry[] = (target as any)[INJECT_METADATA] ?? [];

    // Validate: every constructor param must have @Inject (unless zero params)
    if (ctorLength > 0) {
      for (let i = 0; i < ctorLength; i++) {
        const hasInject = injectMeta.some((m) => m.paramIndex === i);
        if (!hasInject) {
          throw new Error(
            `Missing @Inject on parameter ${i} of ${target.name}`,
          );
        }
      }
    }

    // Sort by param index to build args in correct order
    const sorted = [...injectMeta].sort((a, b) => a.paramIndex - b.paramIndex);

    // Create factory
    const factory = (c: Container) => {
      const args = sorted.map((m) => c.resolve(m.token));
      return new target(...args);
    };

    container.bind(token, factory, { lifecycle });
  }

  return wrapContainer(container);
}

// --- clearRegistry ---

export function clearRegistry(): void {
  registry.length = 0;
}
