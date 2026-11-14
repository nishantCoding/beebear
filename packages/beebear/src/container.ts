import type { InjectionToken } from './token.js';

/**
 * Lifecycle options for a binding.
 *
 * - `singleton` (default): one instance, cached after first resolve
 * - `transient`: new instance on every resolve
 * - `scoped`: one instance per scope (child container)
 */
export interface BindOptions {
  lifecycle?: 'singleton' | 'transient' | 'scoped';
}

/**
 * DI container interface.
 */
export interface Container {
  /**
   * Registers a factory for a token.
   *
   * Factory form:
   *   `bind(token, (c) => new Foo(c.resolve(Bar)))`
   *
   * Shorthand form:
   *   `bind(token, FooClass, [Bar, Baz])`
   */
  bind<T>(
    token: InjectionToken<T>,
    factory: (container: Container) => T,
    options?: BindOptions,
  ): void;
  bind<T>(
    token: InjectionToken<T>,
    constructor: new (...args: any[]) => T,
    dependencies: InjectionToken<any>[],
    options?: BindOptions,
  ): void;

  /** Resolves an instance for the given token. */
  resolve<T>(token: InjectionToken<T>): T;

  /** Checks if a binding exists for the given token. */
  has<T>(token: InjectionToken<T>): boolean;

  /** Eagerly resolves all bindings to catch missing deps and circular deps. */
  validate(): void;

  /** Creates a child scope that inherits parent bindings. */
  createScope(): Container;
}

interface Binding {
  factory: (container: Container) => any;
  lifecycle: 'singleton' | 'transient' | 'scoped';
}

/**
 * Creates a new DI container.
 */
export function createContainer(parent?: ContainerImpl): Container {
  return new ContainerImpl(parent);
}

class ContainerImpl implements Container {
  private bindings = new Map<symbol, Binding>();
  private singletons = new Map<symbol, any>();
  private scopedInstances = new Map<symbol, any>();
  private resolving = new Set<symbol>();

  constructor(private parent?: ContainerImpl) {}

  bind<T>(
    token: InjectionToken<T>,
    factoryOrConstructor: ((container: Container) => T) | (new (...args: any[]) => T),
    depsOrOptions?: InjectionToken<any>[] | BindOptions,
    maybeOptions?: BindOptions,
  ): void {
    let factory: (container: Container) => T;
    let options: BindOptions | undefined;

    if (Array.isArray(depsOrOptions)) {
      // Shorthand form: bind(token, Constructor, [deps], options?)
      const ctor = factoryOrConstructor as new (...args: any[]) => T;
      const deps = depsOrOptions;
      options = maybeOptions;
      factory = (c) => {
        const args = deps.map((dep) => c.resolve(dep));
        return new ctor(...args);
      };
    } else {
      // Factory form: bind(token, factory, options?)
      factory = factoryOrConstructor as (container: Container) => T;
      options = depsOrOptions;
    }

    const lifecycle = options?.lifecycle ?? 'singleton';
    this.bindings.set(token as symbol, { factory, lifecycle });
    // Clear cached singleton if rebinding
    this.singletons.delete(token as symbol);
    this.scopedInstances.delete(token as symbol);
  }

  resolve<T>(token: InjectionToken<T>): T {
    const sym = token as symbol;

    // Check for circular dependency
    if (this.resolving.has(sym)) {
      const path = [...this.resolving, sym]
        .map((s) => (s as symbol).description)
        .join(' → ');
      throw new Error(`Circular dependency detected: ${path}`);
    }

    const binding = this.getBinding(sym);

    if (!binding) {
      const name = (sym as symbol).description ?? '<unknown>';
      throw new Error(`No binding for "${name}"`);
    }

    // Singleton: cache on the container that owns the binding
    if (binding.lifecycle === 'singleton') {
      const owner = this.getBindingOwner(sym);
      if (owner.singletons.has(sym)) {
        return owner.singletons.get(sym) as T;
      }

      this.resolving.add(sym);
      try {
        const instance = binding.factory(this);
        owner.singletons.set(sym, instance);
        return instance;
      } finally {
        this.resolving.delete(sym);
      }
    }

    // Transient: always create new
    if (binding.lifecycle === 'transient') {
      this.resolving.add(sym);
      try {
        return binding.factory(this);
      } finally {
        this.resolving.delete(sym);
      }
    }

    // Scoped: cache per scope (this container instance)
    if (this.scopedInstances.has(sym)) {
      return this.scopedInstances.get(sym) as T;
    }

    this.resolving.add(sym);
    try {
      const instance = binding.factory(this);
      this.scopedInstances.set(sym, instance);
      return instance;
    } finally {
      this.resolving.delete(sym);
    }
  }

  has<T>(token: InjectionToken<T>): boolean {
    return this.getBinding(token as symbol) !== undefined;
  }

  validate(): void {
    const allBindings = this.getAllBindings();
    for (const [sym] of allBindings) {
      try {
        this.resolve(sym as InjectionToken<unknown>);
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Container validation failed: ${error.message}`);
        }
        throw error;
      }
    }
  }

  createScope(): Container {
    return createContainer(this);
  }

  // --- Private helpers ---

  private getBinding(sym: symbol): Binding | undefined {
    return this.bindings.get(sym) ?? this.parent?.getBinding(sym);
  }

  private getBindingOwner(sym: symbol): ContainerImpl {
    if (this.bindings.has(sym)) return this;
    if (this.parent) return this.parent.getBindingOwner(sym);
    return this;
  }

  private getAllBindings(): Map<symbol, Binding> {
    if (this.parent) {
      const parentBindings = this.parent.getAllBindings();
      // Child bindings override parent
      return new Map([...parentBindings, ...this.bindings]);
    }
    return this.bindings;
  }
}
