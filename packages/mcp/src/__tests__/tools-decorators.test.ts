import { describe, it, expect } from 'vitest';
import { scaffoldDecoratorSetup, handleScaffoldDecoratorSetup } from '../tools/scaffold-decorator-setup.js';

describe('scaffold_decorator_setup', () => {
  it('generates decorator-based DI setup', () => {
    const result = scaffoldDecoratorSetup({
      implementations: [
        { token: 'UserRepository', className: 'PrismaUserRepository' },
        {
          token: 'RegisterUser',
          className: 'RegisterUserService',
          dependencies: ['UserRepository'],
        },
      ],
    });
    expect(result).toContain("import { createContainer, createHexApp } from 'beebear'");
    expect(result).toContain("import { Injectable, Inject, withDecorators } from '@beebear-plugins/di-decorators'");
    expect(result).toContain('@Injectable(UserRepository)');
    expect(result).toContain('class PrismaUserRepository implements UserRepository');
    expect(result).toContain('@Injectable(RegisterUser)');
    expect(result).toContain('@Inject(UserRepository)');
    expect(result).toContain('withDecorators(createContainer())');
    expect(result).toContain('container.validate()');
    expect(result).toContain('createHexApp({ container })');
  });

  it('supports non-default lifecycle', () => {
    const result = scaffoldDecoratorSetup({
      implementations: [
        { token: 'RequestLogger', className: 'ConsoleRequestLogger', lifecycle: 'transient' },
      ],
    });
    expect(result).toContain("@Injectable(RequestLogger, { lifecycle: 'transient' })");
  });

  it('omits lifecycle for singleton (default)', () => {
    const result = scaffoldDecoratorSetup({
      implementations: [
        { token: 'Logger', className: 'ConsoleLogger' },
      ],
    });
    expect(result).toContain('@Injectable(Logger)');
    expect(result).not.toContain("lifecycle: 'singleton'");
  });

  it('rejects empty implementations', () => {
    const result = handleScaffoldDecoratorSetup({ implementations: [] });
    expect(result.isError).toBe(true);
  });

  it('rejects non-PascalCase token', () => {
    const result = handleScaffoldDecoratorSetup({
      implementations: [{ token: 'userRepo', className: 'PrismaUserRepo' }],
    });
    expect(result.isError).toBe(true);
  });
});
