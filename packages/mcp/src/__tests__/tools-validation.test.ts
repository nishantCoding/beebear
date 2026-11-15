import { describe, it, expect } from 'vitest';
import { handleScaffoldPort } from '../tools/scaffold-port.js';
import { handleScaffoldUseCase } from '../tools/scaffold-use-case.js';
import { handleScaffoldAdapter } from '../tools/scaffold-adapter.js';
import { handleScaffoldRoute } from '../tools/scaffold-route.js';
import { handleScaffoldContainerSetup } from '../tools/scaffold-container-setup.js';
import { handleScaffoldEntity } from '../tools/scaffold-entity.js';
import { handleScaffoldValueObject } from '../tools/scaffold-value-object.js';
import { handleScaffoldAggregate } from '../tools/scaffold-aggregate.js';
import { handleScaffoldDecoratorSetup } from '../tools/scaffold-decorator-setup.js';

function expectError(result: any, substring: string) {
  expect(result.isError).toBe(true);
  const text = result.content[0].text;
  expect(text).toContain(substring);
}

describe('PascalCase validation', () => {
  it('scaffold_port rejects non-PascalCase name', () => {
    const result = handleScaffoldPort({
      name: 'userRepository',
      direction: 'outbound',
      methods: [{ name: 'find', params: 'id: string', returnType: 'Promise<void>' }],
    });
    expectError(result, 'PascalCase');
  });

  it('scaffold_use_case rejects non-PascalCase class name', () => {
    const result = handleScaffoldUseCase({
      name: 'registerUser',
      port: 'RegisterUser',
      inputType: '{ email: string }',
      outputType: '{ id: string }',
    });
    expectError(result, 'PascalCase');
  });

  it('scaffold_use_case rejects non-PascalCase port name', () => {
    const result = handleScaffoldUseCase({
      name: 'RegisterUserService',
      port: 'registerUser',
      inputType: '{ email: string }',
      outputType: '{ id: string }',
    });
    expectError(result, 'PascalCase');
  });

  it('scaffold_adapter rejects non-PascalCase class name', () => {
    const result = handleScaffoldAdapter({
      name: 'prismaRepo',
      port: 'UserRepository',
      methods: [{ name: 'find', params: 'id: string', returnType: 'Promise<void>' }],
    });
    expectError(result, 'PascalCase');
  });

  it('scaffold_adapter rejects non-PascalCase port name', () => {
    const result = handleScaffoldAdapter({
      name: 'PrismaRepo',
      port: 'userRepository',
      methods: [{ name: 'find', params: 'id: string', returnType: 'Promise<void>' }],
    });
    expectError(result, 'PascalCase');
  });

  it('scaffold_route rejects non-PascalCase token', () => {
    const result = handleScaffoldRoute({
      useCaseToken: 'registerUser',
      method: 'POST',
      path: '/users',
      inputMapping: '{ email: req.body.email }',
    });
    expectError(result, 'PascalCase');
  });

  it('scaffold_container_setup rejects non-PascalCase token', () => {
    const result = handleScaffoldContainerSetup({
      bindings: [{ token: 'userRepo', implementation: 'PrismaRepo' }],
    });
    expectError(result, 'PascalCase');
  });

  it('scaffold_container_setup rejects non-PascalCase implementation', () => {
    const result = handleScaffoldContainerSetup({
      bindings: [{ token: 'UserRepo', implementation: 'prismaRepo' }],
    });
    expectError(result, 'PascalCase');
  });

  it('scaffold_entity rejects non-PascalCase name', () => {
    const result = handleScaffoldEntity({
      name: 'orderItem',
      idType: 'string',
    });
    expectError(result, 'PascalCase');
  });

  it('scaffold_value_object rejects non-PascalCase name', () => {
    const result = handleScaffoldValueObject({
      name: 'money',
      props: [{ name: 'amount', type: 'number' }],
    });
    expectError(result, 'PascalCase');
  });

  it('scaffold_aggregate rejects non-PascalCase aggregate name', () => {
    const result = handleScaffoldAggregate({
      name: 'order',
      idType: 'string',
    });
    expectError(result, 'PascalCase');
  });

  it('scaffold_aggregate rejects non-PascalCase event name', () => {
    const result = handleScaffoldAggregate({
      name: 'Order',
      idType: 'string',
      events: [{ name: 'orderPlaced' }],
    });
    expectError(result, 'PascalCase');
  });

  it('scaffold_decorator_setup rejects non-PascalCase token', () => {
    const result = handleScaffoldDecoratorSetup({
      implementations: [{ token: 'userRepo', className: 'PrismaRepo' }],
    });
    expectError(result, 'PascalCase');
  });

  it('scaffold_decorator_setup rejects non-PascalCase class name', () => {
    const result = handleScaffoldDecoratorSetup({
      implementations: [{ token: 'UserRepo', className: 'prismaRepo' }],
    });
    expectError(result, 'PascalCase');
  });
});

describe('empty collection validation', () => {
  it('scaffold_port outbound rejects missing methods', () => {
    const result = handleScaffoldPort({
      name: 'UserRepository',
      direction: 'outbound',
    });
    expectError(result, 'at least one method');
  });

  it('scaffold_port outbound rejects empty methods array', () => {
    const result = handleScaffoldPort({
      name: 'UserRepository',
      direction: 'outbound',
      methods: [],
    });
    expectError(result, 'at least one method');
  });

  it('scaffold_adapter rejects empty methods', () => {
    const result = handleScaffoldAdapter({
      name: 'PrismaRepo',
      port: 'UserRepository',
      methods: [],
    });
    expectError(result, 'at least one method');
  });

  it('scaffold_container_setup rejects empty bindings', () => {
    const result = handleScaffoldContainerSetup({ bindings: [] });
    expectError(result, 'At least one binding');
  });

  it('scaffold_value_object rejects empty props', () => {
    const result = handleScaffoldValueObject({
      name: 'Money',
      props: [],
    });
    expectError(result, 'at least one property');
  });

  it('scaffold_decorator_setup rejects empty implementations', () => {
    const result = handleScaffoldDecoratorSetup({ implementations: [] });
    expectError(result, 'At least one implementation');
  });
});

describe('valid inputs produce success', () => {
  it('scaffold_port inbound succeeds without methods', () => {
    const result = handleScaffoldPort({
      name: 'RegisterUser',
      direction: 'inbound',
      inputType: '{ email: string }',
      outputType: '{ id: string }',
    });
    expect(result.isError).toBeUndefined();
  });

  it('scaffold_port outbound succeeds with methods', () => {
    const result = handleScaffoldPort({
      name: 'UserRepository',
      direction: 'outbound',
      methods: [{ name: 'findById', params: 'id: string', returnType: 'Promise<User | null>' }],
    });
    expect(result.isError).toBeUndefined();
  });
});
