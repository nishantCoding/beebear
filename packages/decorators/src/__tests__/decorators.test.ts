import { describe, it, expect, beforeEach } from 'vitest';
import { Port, Token, createContainer, createHexApp } from 'beebear';
import type { UseCase } from 'beebear';
import { Injectable, Inject, withDecorators, clearRegistry } from '../index.js';

// --- Port fixtures (tokens reused across tests, classes defined per test) ---

interface Greeter {
  greet(name: string): string;
}
const Greeter = Port<Greeter>('Greeter');

interface Logger {
  log(msg: string): void;
}
const Logger = Port<Logger>('Logger');

interface UserRepo {
  findById(id: string): unknown;
}
const UserRepo = Port<UserRepo>('UserRepo');

interface EmailService {
  send(to: string): void;
}
const EmailService = Port<EmailService>('EmailService');

// --- Clear global registry before each test ---

beforeEach(() => {
  clearRegistry();
});

// --- @Injectable ---

describe('@Injectable', () => {
  it('registers a class so withDecorators can resolve it', () => {
    @Injectable(Greeter)
    class GreeterImpl {
      greet(name: string) {
        return `Hello, ${name}`;
      }
    }

    const container = withDecorators(createContainer());
    const instance = container.resolve(Greeter);
    expect(instance).toBeInstanceOf(GreeterImpl);
    expect(instance.greet('World')).toBe('Hello, World');
  });

  it('returns the class unchanged (no wrapping)', () => {
    class GreeterImpl {
      greet(name: string) {
        return name;
      }
    }
    const result = Injectable(Greeter)(GreeterImpl);
    expect(result).toBe(GreeterImpl);
  });

  it('throws when called without a token argument', () => {
    expect(() => {
      Injectable(undefined as any);
    }).toThrow('@Injectable requires a token argument');
  });
});

// --- @Inject ---

describe('@Inject', () => {
  it('injects dependencies in the correct parameter order', () => {
    @Injectable(UserRepo)
    class UserRepoImpl {
      findById(id: string) {
        return { id };
      }
    }

    @Injectable(EmailService)
    class EmailServiceImpl {
      send(_to: string) {}
    }

    @Injectable(Greeter)
    class GreeterImpl {
      constructor(
        @Inject(UserRepo) public first: UserRepo,
        @Inject(EmailService) public second: EmailService,
      ) {}
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());
    const greeter = container.resolve(Greeter) as any;
    expect(greeter.first).toBeInstanceOf(UserRepoImpl);
    expect(greeter.second).toBeInstanceOf(EmailServiceImpl);
  });
});

// --- withDecorators() — resolution ---

describe('withDecorators() — resolution', () => {
  it('resolves a class with one @Inject dependency', () => {
    @Injectable(Logger)
    class LoggerImpl {
      log(_msg: string) {}
    }

    @Injectable(Greeter)
    class GreeterImpl {
      constructor(@Inject(Logger) public logger: Logger) {}
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());
    const greeter = container.resolve(Greeter) as any;
    expect(greeter.logger).toBeInstanceOf(LoggerImpl);
  });

  it('resolves a class with multiple @Inject dependencies', () => {
    @Injectable(UserRepo)
    class UserRepoImpl {
      findById(id: string) {
        return { id };
      }
    }

    @Injectable(EmailService)
    class EmailServiceImpl {
      send(_to: string) {}
    }

    @Injectable(Greeter)
    class GreeterImpl {
      constructor(
        @Inject(UserRepo) public repo: UserRepo,
        @Inject(EmailService) public email: EmailService,
      ) {}
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());
    const greeter = container.resolve(Greeter) as any;
    expect(greeter.repo).toBeInstanceOf(UserRepoImpl);
    expect(greeter.email).toBeInstanceOf(EmailServiceImpl);
  });

  it('resolves chained dependencies (A → B → C)', () => {
    @Injectable(Logger)
    class LoggerImpl {
      log(_msg: string) {}
    }

    @Injectable(UserRepo)
    class UserRepoImpl {
      constructor(@Inject(Logger) public logger: Logger) {}
      findById(id: string) {
        return { id };
      }
    }

    @Injectable(Greeter)
    class GreeterImpl {
      constructor(@Inject(UserRepo) public repo: UserRepo) {}
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());
    const greeter = container.resolve(Greeter) as any;
    expect(greeter.repo).toBeInstanceOf(UserRepoImpl);
    expect(greeter.repo.logger).toBeInstanceOf(LoggerImpl);
  });
});

// --- withDecorators() — lifecycle ---

describe('withDecorators() — lifecycle', () => {
  it('singleton by default (same instance on multiple resolves)', () => {
    @Injectable(Greeter)
    class GreeterImpl {
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());
    const a = container.resolve(Greeter);
    const b = container.resolve(Greeter);
    expect(a).toBe(b);
  });

  it('transient returns a new instance every resolve', () => {
    @Injectable(Greeter, { lifecycle: 'transient' })
    class GreeterImpl {
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());
    const a = container.resolve(Greeter);
    const b = container.resolve(Greeter);
    expect(a).not.toBe(b);
  });

  it('scoped: same within scope, different across scopes', () => {
    @Injectable(Greeter, { lifecycle: 'scoped' })
    class GreeterImpl {
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());
    const scope1 = container.createScope();
    const scope2 = container.createScope();

    const a = scope1.resolve(Greeter);
    const b = scope1.resolve(Greeter);
    const c = scope2.resolve(Greeter);

    expect(a).toBe(b); // same within scope
    expect(a).not.toBe(c); // different across scopes
  });

  it('explicit singleton option behaves same as default', () => {
    @Injectable(Greeter, { lifecycle: 'singleton' })
    class GreeterImpl {
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());
    const a = container.resolve(Greeter);
    const b = container.resolve(Greeter);
    expect(a).toBe(b);
  });
});

// --- DecoratorContainer ---

describe('DecoratorContainer', () => {
  it('has resolve, has, validate, createScope methods', () => {
    @Injectable(Greeter)
    class GreeterImpl {
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());
    expect(typeof container.resolve).toBe('function');
    expect(typeof container.has).toBe('function');
    expect(typeof container.validate).toBe('function');
    expect(typeof container.createScope).toBe('function');
  });

  it('does NOT have a bind method', () => {
    @Injectable(Greeter)
    class GreeterImpl {
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());
    expect((container as any).bind).toBeUndefined();
  });

  it('has() returns true for bound tokens', () => {
    @Injectable(Greeter)
    class GreeterImpl {
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());
    expect(container.has(Greeter)).toBe(true);
  });

  it('has() returns false for unbound tokens', () => {
    @Injectable(Greeter)
    class GreeterImpl {
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());
    const Unbound = Token<unknown>('Unbound');
    expect(container.has(Unbound)).toBe(false);
  });

  it('validate() succeeds when all dependencies are satisfied', () => {
    @Injectable(Logger)
    class LoggerImpl {
      log(_msg: string) {}
    }

    @Injectable(Greeter)
    class GreeterImpl {
      constructor(@Inject(Logger) public logger: Logger) {}
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());
    expect(() => container.validate()).not.toThrow();
  });

  it('validate() throws when a dependency is missing', () => {
    @Injectable(Greeter)
    class GreeterImpl {
      constructor(@Inject(Logger) public logger: Logger) {}
      greet(name: string) {
        return name;
      }
    }

    // Logger is NOT registered — validate should catch this
    const container = withDecorators(createContainer());
    expect(() => container.validate()).toThrow(/No binding for/);
  });

  it('createScope() returns a DecoratorContainer (no bind method)', () => {
    @Injectable(Greeter)
    class GreeterImpl {
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());
    const scope = container.createScope();

    expect(typeof scope.resolve).toBe('function');
    expect(typeof scope.has).toBe('function');
    expect(typeof scope.validate).toBe('function');
    expect(typeof scope.createScope).toBe('function');
    expect((scope as any).bind).toBeUndefined();
  });
});

// --- clearRegistry ---

describe('clearRegistry()', () => {
  it('after clear, previously decorated classes are not bound', () => {
    @Injectable(Greeter)
    class GreeterImpl {
      greet(name: string) {
        return name;
      }
    }

    clearRegistry();

    const container = withDecorators(createContainer());
    expect(container.has(Greeter)).toBe(false);
  });

  it('new registrations after clear work normally', () => {
    @Injectable(Greeter)
    class OldGreeter {
      greet(_name: string) {
        return 'old';
      }
    }

    clearRegistry();

    @Injectable(Greeter)
    class NewGreeter {
      greet(_name: string) {
        return 'new';
      }
    }

    const container = withDecorators(createContainer());
    expect(container.resolve(Greeter).greet('x')).toBe('new');
  });
});

// --- Error cases ---

describe('error cases', () => {
  it('@Injectable() without token throws', () => {
    expect(() => {
      Injectable(undefined as any);
    }).toThrow('@Injectable requires a token argument');
  });

  it('missing @Inject on a constructor parameter throws', () => {
    @Injectable(Greeter)
    class BadGreeter {
      constructor(dep: string) {}
      greet(name: string) {
        return name;
      }
    }

    expect(() => withDecorators(createContainer())).toThrow(
      'Missing @Inject on parameter 0 of BadGreeter',
    );
  });

  it('duplicate @Injectable for the same token throws', () => {
    @Injectable(Greeter)
    class GreeterA {
      greet(_name: string) {
        return 'a';
      }
    }

    @Injectable(Greeter)
    class GreeterB {
      greet(_name: string) {
        return 'b';
      }
    }

    expect(() => withDecorators(createContainer())).toThrow(
      'Duplicate @Injectable for token "Greeter"',
    );
  });

  it('resolve() for unbound token throws', () => {
    @Injectable(Greeter)
    class GreeterImpl {
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());
    const NeverBound = Token<unknown>('NeverBound');

    expect(() => container.resolve(NeverBound)).toThrow('No binding for "NeverBound"');
  });

  it('circular dependency detected', () => {
    const A = Port<{ value: string }>('A');
    const B = Port<{ value: string }>('B');

    @Injectable(A)
    class AImpl {
      constructor(@Inject(B) public b: any) {}
      value = 'a';
    }

    @Injectable(B)
    class BImpl {
      constructor(@Inject(A) public a: any) {}
      value = 'b';
    }

    const container = withDecorators(createContainer());
    expect(() => container.resolve(A)).toThrow(/Circular dependency detected/);
  });
});

// --- Behavior rules ---

describe('behavior rules', () => {
  it('classes without @Injectable are invisible to withDecorators', () => {
    // This class exists but is never decorated with @Injectable
    class UnregisteredGreeter {
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());
    expect(container.has(Greeter)).toBe(false);
  });

  it('withDecorators binds at call time — later decorations not included', () => {
    @Injectable(Greeter)
    class GreeterImpl {
      greet(name: string) {
        return name;
      }
    }

    const container = withDecorators(createContainer());

    // Decorated AFTER withDecorators was called
    @Injectable(Logger)
    class LoggerImpl {
      log(_msg: string) {}
    }

    expect(container.has(Greeter)).toBe(true);
    expect(container.has(Logger)).toBe(false);
  });

  it('DecoratorContainer works with createHexApp', async () => {
    interface GetName extends UseCase<{ id: string }, { name: string }> {}
    const GetName = Port<GetName>('GetName');

    @Injectable(GetName)
    class GetNameService {
      async execute(input: { id: string }) {
        return { name: `User-${input.id}` };
      }
    }

    const container = withDecorators(createContainer());
    const hex = createHexApp({ container: container as any });

    const result = await hex.execute(GetName, { id: '42' });
    expect(result).toEqual({ success: true, data: { name: 'User-42' } });
  });
});
