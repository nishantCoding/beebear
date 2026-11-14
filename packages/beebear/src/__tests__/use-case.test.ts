import { describe, it, expect } from 'vitest';
import type { UseCase } from '../use-case.js';
import { Port } from '../port.js';
import { createContainer } from '../container.js';
import { NotFoundError, ValidationError } from '../errors.js';

// ---- Test fixtures ----

interface CreateUserInput {
  email: string;
  name: string;
}

interface CreateUserOutput {
  id: string;
  email: string;
}

class CreateUserService implements UseCase<CreateUserInput, CreateUserOutput> {
  async execute(input: CreateUserInput): Promise<CreateUserOutput> {
    return { id: '1', email: input.email };
  }
}

class DeleteUserService implements UseCase<{ id: string }, void> {
  async execute(_input: { id: string }): Promise<void> {
    // no-op
  }
}

class ListNamesService implements UseCase<void, string[]> {
  async execute(): Promise<string[]> {
    return ['Alice', 'Bob'];
  }
}

class IsActiveService implements UseCase<string, boolean> {
  async execute(input: string): Promise<boolean> {
    return input === 'active';
  }
}

class GetUserService implements UseCase<{ id: string }, { id: string; name: string }> {
  async execute(input: { id: string }): Promise<{ id: string; name: string }> {
    const user = this.findUser(input.id);
    if (!user) throw new NotFoundError(`User ${input.id} not found`);
    return this.toOutput(user);
  }

  private findUser(id: string): { id: string; name: string } | null {
    if (id === '1') return { id: '1', name: 'Alice' };
    return null;
  }

  private toOutput(user: { id: string; name: string }): { id: string; name: string } {
    return { id: user.id, name: user.name };
  }
}

class ValidatingService implements UseCase<{ email: string }, { id: string }> {
  async execute(input: { email: string }): Promise<{ id: string }> {
    if (!input.email.includes('@')) {
      throw new ValidationError('Invalid email');
    }
    return { id: '1' };
  }
}

// ---- Tests ----

describe('UseCase<TInput, TOutput>', () => {
  describe('execute() contract', () => {
    it('returns a Promise', () => {
      const uc = new CreateUserService();
      const result = uc.execute({ email: 'a@b.com', name: 'Alice' });
      expect(result).toBeInstanceOf(Promise);
    });

    it('resolves with the correct output', async () => {
      const uc = new CreateUserService();
      const result = await uc.execute({ email: 'a@b.com', name: 'Alice' });
      expect(result).toEqual({ id: '1', email: 'a@b.com' });
    });
  });

  describe('void output', () => {
    it('resolves with undefined for void output', async () => {
      const uc = new DeleteUserService();
      const result = await uc.execute({ id: '1' });
      expect(result).toBeUndefined();
    });
  });

  describe('void input', () => {
    it('works with no input argument', async () => {
      const uc = new ListNamesService();
      const result = await uc.execute();
      expect(result).toEqual(['Alice', 'Bob']);
    });
  });

  describe('primitive types', () => {
    it('works with string input and boolean output', async () => {
      const uc = new IsActiveService();
      expect(await uc.execute('active')).toBe(true);
      expect(await uc.execute('inactive')).toBe(false);
    });
  });

  describe('private helper methods', () => {
    it('implementing class can have private helpers beyond execute()', async () => {
      const uc = new GetUserService();
      const result = await uc.execute({ id: '1' });
      expect(result).toEqual({ id: '1', name: 'Alice' });
    });

    it('execute() is the only public contract method', () => {
      const uc = new GetUserService();
      // execute exists
      expect(typeof uc.execute).toBe('function');
      // private helpers are not accessible on the interface type
      // (they exist on the class but not on UseCase<TInput, TOutput>)
      const asUseCase: UseCase<{ id: string }, { id: string; name: string }> = uc;
      expect(typeof asUseCase.execute).toBe('function');
    });
  });

  describe('error handling', () => {
    it('can throw domain errors from execute()', async () => {
      const uc = new GetUserService();
      await expect(uc.execute({ id: '999' })).rejects.toThrow(NotFoundError);
      await expect(uc.execute({ id: '999' })).rejects.toThrow('User 999 not found');
    });

    it('thrown errors are instanceof their domain error class', async () => {
      const uc = new ValidatingService();
      try {
        await uc.execute({ email: 'bad' });
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).code).toBe('ValidationError');
      }
    });
  });

  describe('integration with Port<T> and container', () => {
    it('use case can be bound and resolved via container', async () => {
      interface RegisterUser extends UseCase<CreateUserInput, CreateUserOutput> {}
      const RegisterUser = Port<RegisterUser>('RegisterUser');

      const container = createContainer();
      container.bind(RegisterUser, () => new CreateUserService());

      const uc = container.resolve(RegisterUser);
      const result = await uc.execute({ email: 'a@b.com', name: 'Alice' });
      expect(result).toEqual({ id: '1', email: 'a@b.com' });
    });

    it('use case can be bound with shorthand form', async () => {
      interface ListNames extends UseCase<void, string[]> {}
      const ListNames = Port<ListNames>('ListNames');

      const container = createContainer();
      container.bind(ListNames, ListNamesService, []);

      const uc = container.resolve(ListNames);
      const result = await uc.execute();
      expect(result).toEqual(['Alice', 'Bob']);
    });

    it('multiple use cases coexist in the same container', async () => {
      interface CreateUser extends UseCase<CreateUserInput, CreateUserOutput> {}
      const CreateUser = Port<CreateUser>('CreateUser');

      interface DeleteUser extends UseCase<{ id: string }, void> {}
      const DeleteUser = Port<DeleteUser>('DeleteUser');

      const container = createContainer();
      container.bind(CreateUser, () => new CreateUserService());
      container.bind(DeleteUser, () => new DeleteUserService());

      const create = container.resolve(CreateUser);
      const del = container.resolve(DeleteUser);

      const created = await create.execute({ email: 'a@b.com', name: 'Alice' });
      expect(created).toEqual({ id: '1', email: 'a@b.com' });

      const deleted = await del.execute({ id: '1' });
      expect(deleted).toBeUndefined();
    });
  });

  describe('type-only nature', () => {
    it('UseCase has no runtime value (import type only)', async () => {
      // UseCase is imported as `import type` — it doesn't exist at runtime.
      // This test verifies that the pattern works purely through structural
      // typing: any object with a matching execute() method satisfies the contract.
      const plainObject: UseCase<string, number> = {
        execute: async (input: string) => input.length,
      };
      expect(await plainObject.execute('hello')).toBe(5);
    });

    it('structural typing — any object with execute() satisfies the contract', async () => {
      const ad_hoc: UseCase<number, string> = {
        async execute(n: number) {
          return 'x'.repeat(n);
        },
      };
      expect(await ad_hoc.execute(3)).toBe('xxx');
    });
  });
});
