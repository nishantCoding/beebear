import { describe, it, expect } from 'vitest';
import { scaffoldRoute, handleScaffoldRoute } from '../tools/scaffold-route.js';
import { scaffoldContainerSetup, handleScaffoldContainerSetup } from '../tools/scaffold-container-setup.js';

describe('scaffold_route', () => {
  it('generates POST route', () => {
    const result = scaffoldRoute({
      useCaseToken: 'RegisterUser',
      method: 'POST',
      path: '/users',
      inputMapping: '{ email: req.body.email, name: req.body.name }',
    });
    expect(result).toContain("app.post('/users'");
    expect(result).toContain('hex.httpAdapter(RegisterUser');
    expect(result).toContain('toInput: (req) =>');
    expect(result).toContain('req.body.email');
  });

  it('includes status override', () => {
    const result = scaffoldRoute({
      useCaseToken: 'GetUser',
      method: 'GET',
      path: '/users/:id',
      inputMapping: '{ id: req.params.id }',
      statusOverride: 200,
    });
    expect(result).toContain('status: 200');
  });

  it('omits status when not provided', () => {
    const result = scaffoldRoute({
      useCaseToken: 'GetUser',
      method: 'GET',
      path: '/users/:id',
      inputMapping: '{ id: req.params.id }',
    });
    expect(result).not.toContain('status:');
  });

  it('rejects non-PascalCase token', () => {
    const result = handleScaffoldRoute({
      useCaseToken: 'getUser',
      method: 'GET',
      path: '/users',
      inputMapping: '{}',
    });
    expect(result.isError).toBe(true);
  });
});

describe('scaffold_container_setup', () => {
  it('generates bindings with dependencies', () => {
    const result = scaffoldContainerSetup({
      bindings: [
        { token: 'UserRepository', implementation: 'PrismaUserRepository' },
        { token: 'RegisterUser', implementation: 'RegisterUserService', dependencies: ['UserRepository'] },
      ],
    });
    expect(result).toContain("import { createContainer } from 'beebear'");
    expect(result).toContain('const container = createContainer()');
    expect(result).toContain('container.bind(UserRepository, () => new PrismaUserRepository())');
    expect(result).toContain('container.bind(RegisterUser, (c) => new RegisterUserService(');
    expect(result).toContain('container.resolve(UserRepository)');
    expect(result).toContain('container.validate()');
  });

  it('generates bindings without dependencies', () => {
    const result = scaffoldContainerSetup({
      bindings: [
        { token: 'Logger', implementation: 'ConsoleLogger' },
      ],
    });
    expect(result).toContain('container.bind(Logger, () => new ConsoleLogger())');
  });

  it('rejects empty bindings', () => {
    const result = handleScaffoldContainerSetup({ bindings: [] });
    expect(result.isError).toBe(true);
  });

  it('rejects non-PascalCase token', () => {
    const result = handleScaffoldContainerSetup({
      bindings: [{ token: 'userRepo', implementation: 'PrismaUserRepo' }],
    });
    expect(result.isError).toBe(true);
  });
});
