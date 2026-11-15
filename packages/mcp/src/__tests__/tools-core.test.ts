import { describe, it, expect } from 'vitest';
import { scaffoldPort, handleScaffoldPort } from '../tools/scaffold-port.js';
import { scaffoldUseCase, handleScaffoldUseCase } from '../tools/scaffold-use-case.js';
import { scaffoldAdapter, handleScaffoldAdapter } from '../tools/scaffold-adapter.js';

describe('scaffold_port', () => {
  describe('inbound', () => {
    it('generates UseCase port with token', () => {
      const result = scaffoldPort({
        name: 'RegisterUser',
        direction: 'inbound',
        inputType: '{ email: string }',
        outputType: '{ id: string }',
      });
      expect(result).toContain("import { Port } from 'beebear';");
      expect(result).toContain("import type { UseCase } from 'beebear';");
      expect(result).toContain('interface RegisterUser extends UseCase<{ email: string }, { id: string }>');
      expect(result).toContain("Port<RegisterUser>('RegisterUser')");
    });

    it('defaults to void types when not provided', () => {
      const result = scaffoldPort({ name: 'DoSomething', direction: 'inbound' });
      expect(result).toContain('UseCase<void, void>');
    });
  });

  describe('outbound', () => {
    it('generates interface with methods and token', () => {
      const result = scaffoldPort({
        name: 'UserRepository',
        direction: 'outbound',
        methods: [
          { name: 'findByEmail', params: 'email: string', returnType: 'Promise<User | null>' },
          { name: 'save', params: 'user: User', returnType: 'Promise<void>' },
        ],
      });
      expect(result).toContain("import { Port } from 'beebear';");
      expect(result).toContain('interface UserRepository');
      expect(result).toContain('findByEmail(email: string): Promise<User | null>;');
      expect(result).toContain('save(user: User): Promise<void>;');
      expect(result).toContain("Port<UserRepository>('UserRepository')");
    });
  });

  describe('validation', () => {
    it('rejects non-PascalCase name', () => {
      const result = handleScaffoldPort({ name: 'userRepo', direction: 'outbound', methods: [{ name: 'find', params: '', returnType: 'void' }] });
      expect(result.isError).toBe(true);
    });

    it('rejects outbound port without methods', () => {
      const result = handleScaffoldPort({ name: 'UserRepo', direction: 'outbound' });
      expect(result.isError).toBe(true);
    });
  });
});

describe('scaffold_use_case', () => {
  it('generates class with dependencies', () => {
    const result = scaffoldUseCase({
      name: 'RegisterUserService',
      port: 'RegisterUser',
      inputType: '{ email: string }',
      outputType: '{ id: string }',
      dependencies: [
        { name: 'userRepository', type: 'UserRepository' },
      ],
    });
    expect(result).toContain('class RegisterUserService implements RegisterUser');
    expect(result).toContain('private readonly userRepository: UserRepository');
    expect(result).toContain('async execute(input: { email: string }): Promise<{ id: string }>');
  });

  it('generates class without dependencies', () => {
    const result = scaffoldUseCase({
      name: 'HealthCheckService',
      port: 'HealthCheck',
      inputType: 'void',
      outputType: '{ status: string }',
    });
    expect(result).toContain('class HealthCheckService implements HealthCheck');
    expect(result).not.toContain('constructor');
  });

  it('rejects non-PascalCase name', () => {
    const result = handleScaffoldUseCase({ name: 'registerUser', port: 'RegisterUser', inputType: 'void', outputType: 'void' });
    expect(result.isError).toBe(true);
  });
});

describe('scaffold_adapter', () => {
  it('generates class with method stubs', () => {
    const result = scaffoldAdapter({
      name: 'PrismaUserRepository',
      port: 'UserRepository',
      methods: [
        { name: 'findByEmail', params: 'email: string', returnType: 'Promise<User | null>' },
        { name: 'save', params: 'user: User', returnType: 'Promise<void>' },
      ],
    });
    expect(result).toContain('class PrismaUserRepository implements UserRepository');
    expect(result).toContain('async findByEmail(email: string)');
    expect(result).toContain('async save(user: User)');
    expect(result).toContain("throw new Error('Not implemented')");
  });

  it('rejects non-PascalCase name', () => {
    const result = handleScaffoldAdapter({
      name: 'prismaUserRepo',
      port: 'UserRepository',
      methods: [{ name: 'find', params: '', returnType: 'void' }],
    });
    expect(result.isError).toBe(true);
  });

  it('rejects empty methods', () => {
    const result = handleScaffoldAdapter({
      name: 'PrismaUserRepo',
      port: 'UserRepository',
      methods: [],
    });
    expect(result.isError).toBe(true);
  });
});
