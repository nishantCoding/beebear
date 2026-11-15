import { describe, it, expect } from 'vitest';
import {
  isPascalCase,
  makeErrorResult,
  makeSuccessResult,
  buildImportLines,
  generateMethodStubs,
} from '../tools/helpers.js';

describe('isPascalCase', () => {
  it('accepts single word', () => {
    expect(isPascalCase('User')).toBe(true);
  });

  it('accepts multi-word PascalCase', () => {
    expect(isPascalCase('UserRepository')).toBe(true);
  });

  it('accepts with numbers', () => {
    expect(isPascalCase('OAuth2Client')).toBe(true);
  });

  it('rejects camelCase', () => {
    expect(isPascalCase('userRepository')).toBe(false);
  });

  it('rejects snake_case', () => {
    expect(isPascalCase('user_repository')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isPascalCase('')).toBe(false);
  });

  it('rejects kebab-case', () => {
    expect(isPascalCase('user-repository')).toBe(false);
  });
});

describe('makeErrorResult', () => {
  it('returns isError true with message', () => {
    const result = makeErrorResult('Something went wrong');
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'Something went wrong' }]);
  });
});

describe('makeSuccessResult', () => {
  it('returns content without isError', () => {
    const result = makeSuccessResult('const x = 1;');
    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([{ type: 'text', text: 'const x = 1;' }]);
  });
});

describe('buildImportLines', () => {
  it('generates value import', () => {
    const result = buildImportLines([
      { names: ['Port'], from: 'beebear' },
    ]);
    expect(result).toBe("import { Port } from 'beebear';");
  });

  it('generates type-only import', () => {
    const result = buildImportLines([
      { names: ['UseCase'], from: 'beebear', typeOnly: true },
    ]);
    expect(result).toBe("import type { UseCase } from 'beebear';");
  });

  it('generates multiple imports', () => {
    const result = buildImportLines([
      { names: ['Port'], from: 'beebear' },
      { names: ['UseCase'], from: 'beebear', typeOnly: true },
    ]);
    expect(result).toBe(
      "import { Port } from 'beebear';\nimport type { UseCase } from 'beebear';",
    );
  });

  it('combines multiple names in one import', () => {
    const result = buildImportLines([
      { names: ['Port', 'createContainer'], from: 'beebear' },
    ]);
    expect(result).toBe("import { Port, createContainer } from 'beebear';");
  });
});

describe('generateMethodStubs', () => {
  it('generates async method stub for Promise return type', () => {
    const result = generateMethodStubs([
      { name: 'findById', params: 'id: string', returnType: 'Promise<User | null>' },
    ]);
    expect(result).toContain('async findById(id: string): Promise<User | null>');
    expect(result).toContain("throw new Error('Not implemented')");
  });

  it('generates sync method stub for non-Promise return type', () => {
    const result = generateMethodStubs([
      { name: 'calculate', params: 'amount: number', returnType: 'number' },
    ]);
    expect(result).toContain('calculate(amount: number): number');
    expect(result).not.toContain('async');
  });

  it('generates multiple method stubs', () => {
    const result = generateMethodStubs([
      { name: 'findById', params: 'id: string', returnType: 'Promise<User | null>' },
      { name: 'save', params: 'user: User', returnType: 'Promise<void>' },
    ]);
    expect(result).toContain('findById');
    expect(result).toContain('save');
  });
});
