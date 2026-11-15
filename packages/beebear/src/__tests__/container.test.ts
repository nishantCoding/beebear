import { describe, it, expect, beforeEach } from 'vitest';
import { Token, clearTokenRegistry } from '../token.js';
import { Port } from '../port.js';
import { createContainer } from '../container.js';

beforeEach(() => {
  clearTokenRegistry();
});

// --- Test helpers ---

interface Logger {
  log(msg: string): void;
}

interface UserRepository {
  findByEmail(email: string): Promise<unknown>;
  save(user: unknown): Promise<void>;
}

interface EmailService {
  sendWelcome(email: string): Promise<void>;
}

interface RegisterUser {
  execute(input: { email: string }): Promise<{ id: string }>;
}

const Logger = Token<Logger>('Logger');
const UserRepository = Port<UserRepository>('UserRepository');
const EmailService = Port<EmailService>('EmailService');
const RegisterUser = Port<RegisterUser>('RegisterUser');

class FakeLogger implements Logger {
  log(_msg: string) {}
}

class FakeUserRepo implements UserRepository {
  async findByEmail(_email: string) { return null; }
  async save(_user: unknown) {}
}

class FakeEmailService implements EmailService {
  async sendWelcome(_email: string) {}
}

class FakeRegisterUser implements RegisterUser {
  constructor(
    public repo: UserRepository,
    public email: EmailService,
  ) {}
  async execute(_input: { email: string }) { return { id: '1' }; }
}

// --- Tests ---

describe('createContainer()', () => {
  it('returns a container object', () => {
    const container = createContainer();
    expect(container).toBeDefined();
    expect(typeof container.bind).toBe('function');
    expect(typeof container.resolve).toBe('function');
    expect(typeof container.validate).toBe('function');
    expect(typeof container.createScope).toBe('function');
    expect(typeof container.has).toBe('function');
  });
});

describe('container.bind() and container.resolve()', () => {
  // --- Basic binding and resolution ---

  it('resolves a bound token', () => {
    const container = createContainer();
    const instance = new FakeLogger();
    container.bind(Logger, () => instance);

    expect(container.resolve(Logger)).toBe(instance);
  });

  it('factory receives the container for resolving dependencies', () => {
    const container = createContainer();
    container.bind(UserRepository, () => new FakeUserRepo());
    container.bind(EmailService, () => new FakeEmailService());
    container.bind(RegisterUser, (c) => new FakeRegisterUser(
      c.resolve(UserRepository),
      c.resolve(EmailService),
    ));

    const useCase = container.resolve(RegisterUser);
    expect(useCase).toBeInstanceOf(FakeRegisterUser);
    expect((useCase as FakeRegisterUser).repo).toBeInstanceOf(FakeUserRepo);
    expect((useCase as FakeRegisterUser).email).toBeInstanceOf(FakeEmailService);
  });

  it('throws on resolving an unbound token', () => {
    const container = createContainer();
    const Unbound = Token<unknown>('Unbound');

    expect(() => container.resolve(Unbound)).toThrow('No binding for "Unbound"');
  });

  // --- Rebinding ---

  it('rebinding replaces the previous factory', () => {
    const container = createContainer();
    const first = new FakeLogger();
    const second = new FakeLogger();

    container.bind(Logger, () => first);
    container.bind(Logger, () => second);

    expect(container.resolve(Logger)).toBe(second);
  });

  // --- Shorthand form ---

  it('shorthand binds a class with dependency tokens', () => {
    const container = createContainer();
    container.bind(UserRepository, () => new FakeUserRepo());
    container.bind(EmailService, () => new FakeEmailService());
    container.bind(RegisterUser, FakeRegisterUser, [UserRepository, EmailService]);

    const useCase = container.resolve(RegisterUser);
    expect(useCase).toBeInstanceOf(FakeRegisterUser);
    expect((useCase as FakeRegisterUser).repo).toBeInstanceOf(FakeUserRepo);
    expect((useCase as FakeRegisterUser).email).toBeInstanceOf(FakeEmailService);
  });

  it('shorthand with empty dependencies array', () => {
    const container = createContainer();
    container.bind(Logger, FakeLogger, []);

    expect(container.resolve(Logger)).toBeInstanceOf(FakeLogger);
  });
});

describe('container.has()', () => {
  it('returns true for bound tokens', () => {
    const container = createContainer();
    container.bind(Logger, () => new FakeLogger());

    expect(container.has(Logger)).toBe(true);
  });

  it('returns false for unbound tokens', () => {
    const container = createContainer();
    const Unbound = Token<unknown>('Unbound');

    expect(container.has(Unbound)).toBe(false);
  });
});

describe('lifecycle: singleton (default)', () => {
  it('returns the same instance on multiple resolves', () => {
    const container = createContainer();
    container.bind(Logger, () => new FakeLogger());

    const a = container.resolve(Logger);
    const b = container.resolve(Logger);
    expect(a).toBe(b);
  });

  it('singleton is the default when no options provided', () => {
    const container = createContainer();
    container.bind(Logger, () => new FakeLogger());

    const a = container.resolve(Logger);
    const b = container.resolve(Logger);
    expect(a).toBe(b);
  });

  it('explicit singleton behaves the same as default', () => {
    const container = createContainer();
    container.bind(Logger, () => new FakeLogger(), { lifecycle: 'singleton' });

    const a = container.resolve(Logger);
    const b = container.resolve(Logger);
    expect(a).toBe(b);
  });
});

describe('lifecycle: transient', () => {
  it('returns a new instance on every resolve', () => {
    const container = createContainer();
    container.bind(Logger, () => new FakeLogger(), { lifecycle: 'transient' });

    const a = container.resolve(Logger);
    const b = container.resolve(Logger);
    expect(a).not.toBe(b);
  });
});

describe('lifecycle: scoped', () => {
  it('returns the same instance within a scope', () => {
    const container = createContainer();
    container.bind(Logger, () => new FakeLogger(), { lifecycle: 'scoped' });

    const scope = container.createScope();
    const a = scope.resolve(Logger);
    const b = scope.resolve(Logger);
    expect(a).toBe(b);
  });

  it('returns different instances across different scopes', () => {
    const container = createContainer();
    container.bind(Logger, () => new FakeLogger(), { lifecycle: 'scoped' });

    const scope1 = container.createScope();
    const scope2 = container.createScope();
    const a = scope1.resolve(Logger);
    const b = scope2.resolve(Logger);
    expect(a).not.toBe(b);
  });

  it('resolving scoped token on root container creates a root-level instance', () => {
    const container = createContainer();
    container.bind(Logger, () => new FakeLogger(), { lifecycle: 'scoped' });

    const a = container.resolve(Logger);
    const b = container.resolve(Logger);
    expect(a).toBe(b);
  });
});

describe('container.createScope()', () => {
  it('child scope inherits parent bindings', () => {
    const container = createContainer();
    container.bind(Logger, () => new FakeLogger());

    const scope = container.createScope();
    expect(scope.resolve(Logger)).toBeInstanceOf(FakeLogger);
  });

  it('singletons are shared between parent and child scope', () => {
    const container = createContainer();
    container.bind(Logger, () => new FakeLogger());

    const parentInstance = container.resolve(Logger);
    const scope = container.createScope();
    const childInstance = scope.resolve(Logger);
    expect(childInstance).toBe(parentInstance);
  });

  it('child bindings do not affect the parent', () => {
    const container = createContainer();
    const ChildOnly = Token<string>('ChildOnly');

    const scope = container.createScope();
    scope.bind(ChildOnly, () => 'hello');

    expect(scope.resolve(ChildOnly)).toBe('hello');
    expect(container.has(ChildOnly)).toBe(false);
    expect(() => container.resolve(ChildOnly)).toThrow('No binding for "ChildOnly"');
  });

  it('child can override parent bindings without affecting parent', () => {
    const container = createContainer();
    const original = new FakeLogger();
    const override = new FakeLogger();

    container.bind(Logger, () => original);
    const scope = container.createScope();
    scope.bind(Logger, () => override);

    expect(container.resolve(Logger)).toBe(original);
    expect(scope.resolve(Logger)).toBe(override);
  });

  it('transient bindings create new instances in child scope', () => {
    const container = createContainer();
    container.bind(Logger, () => new FakeLogger(), { lifecycle: 'transient' });

    const scope = container.createScope();
    const a = scope.resolve(Logger);
    const b = scope.resolve(Logger);
    expect(a).not.toBe(b);
  });
});

describe('circular dependency detection', () => {
  it('throws on direct circular dependency (A → B → A)', () => {
    const A = Token<unknown>('A');
    const B = Token<unknown>('B');

    const container = createContainer();
    container.bind(A, (c) => ({ dep: c.resolve(B) }));
    container.bind(B, (c) => ({ dep: c.resolve(A) }));

    expect(() => container.resolve(A)).toThrow(/Circular dependency detected/);
  });

  it('throws on transitive circular dependency (A → B → C → A)', () => {
    const A = Token<unknown>('A');
    const B = Token<unknown>('B');
    const C = Token<unknown>('C');

    const container = createContainer();
    container.bind(A, (c) => ({ dep: c.resolve(B) }));
    container.bind(B, (c) => ({ dep: c.resolve(C) }));
    container.bind(C, (c) => ({ dep: c.resolve(A) }));

    expect(() => container.resolve(A)).toThrow(/Circular dependency detected/);
  });

  it('includes the dependency path in the error message', () => {
    const A = Token<unknown>('A');
    const B = Token<unknown>('B');

    const container = createContainer();
    container.bind(A, (c) => ({ dep: c.resolve(B) }));
    container.bind(B, (c) => ({ dep: c.resolve(A) }));

    expect(() => container.resolve(A)).toThrow('A → B → A');
  });
});

describe('container.validate()', () => {
  it('succeeds when all dependencies are satisfied', () => {
    const container = createContainer();
    container.bind(UserRepository, () => new FakeUserRepo());
    container.bind(EmailService, () => new FakeEmailService());
    container.bind(RegisterUser, (c) => new FakeRegisterUser(
      c.resolve(UserRepository),
      c.resolve(EmailService),
    ));

    expect(() => container.validate()).not.toThrow();
  });

  it('throws when a dependency is missing', () => {
    const container = createContainer();
    container.bind(RegisterUser, (c) => new FakeRegisterUser(
      c.resolve(UserRepository),
      c.resolve(EmailService),
    ));
    // UserRepository and EmailService never bound

    expect(() => container.validate()).toThrow(/No binding for/);
  });

  it('throws on circular dependencies', () => {
    const A = Token<unknown>('A');
    const B = Token<unknown>('B');

    const container = createContainer();
    container.bind(A, (c) => ({ dep: c.resolve(B) }));
    container.bind(B, (c) => ({ dep: c.resolve(A) }));

    expect(() => container.validate()).toThrow(/Circular dependency detected/);
  });

  it('after validate succeeds, all singletons are cached', () => {
    let callCount = 0;
    const container = createContainer();
    container.bind(Logger, () => {
      callCount++;
      return new FakeLogger();
    });

    container.validate();
    expect(callCount).toBe(1);

    // Subsequent resolve returns cached — factory not called again
    container.resolve(Logger);
    expect(callCount).toBe(1);
  });
});

describe('Token<T> and Port<T> interoperability', () => {
  it('container resolves Token<T> and Port<T> tokens identically', () => {
    const container = createContainer();
    const GeneralToken = Token<string>('General');
    const PortToken = Port<string>('PortBased');

    container.bind(GeneralToken, () => 'from token');
    container.bind(PortToken, () => 'from port');

    expect(container.resolve(GeneralToken)).toBe('from token');
    expect(container.resolve(PortToken)).toBe('from port');
  });
});
