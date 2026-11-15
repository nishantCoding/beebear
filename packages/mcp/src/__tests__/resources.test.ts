import { describe, it, expect } from 'vitest';
import { OVERVIEW } from '../resources/overview.js';
import { API } from '../resources/api.js';
import { PATTERNS } from '../resources/patterns.js';
import { PROJECT_STRUCTURE } from '../resources/project-structure.js';
import { ERRORS } from '../resources/errors.js';
import { HTTP_ADAPTERS } from '../resources/http-adapters.js';
import { DECORATORS } from '../resources/decorators.js';
import { DDD } from '../resources/ddd.js';

describe('overview resource', () => {
  it('mentions beebear and hexagonal architecture', () => {
    expect(OVERVIEW).toContain('beebear');
    expect(OVERVIEW).toContain('hexagonal architecture');
  });

  it('covers core concepts', () => {
    expect(OVERVIEW).toContain('Port<T>');
    expect(OVERVIEW).toContain('createContainer');
    expect(OVERVIEW).toContain('createHexApp');
    expect(OVERVIEW).toContain('httpAdapter');
  });

  it('mentions plugins', () => {
    expect(OVERVIEW).toContain('@beebear-plugins/di-decorators');
    expect(OVERVIEW).toContain('@beebear-plugins/ddd');
  });
});

describe('api resource', () => {
  it('documents Token and Port', () => {
    expect(API).toContain('Token<T>');
    expect(API).toContain('Port<T>');
    expect(API).toContain('InjectionToken<T>');
  });

  it('documents Container', () => {
    expect(API).toContain('createContainer');
    expect(API).toContain('bind');
    expect(API).toContain('resolve');
    expect(API).toContain('validate');
    expect(API).toContain('createScope');
    expect(API).toContain('BindOptions');
  });

  it('documents error classes', () => {
    expect(API).toContain('BusinessError');
    expect(API).toContain('ValidationError');
    expect(API).toContain('NotFoundError');
    expect(API).toContain('ConflictError');
    expect(API).toContain('UnauthorizedError');
    expect(API).toContain('ForbiddenError');
  });

  it('documents UseCase interface', () => {
    expect(API).toContain('UseCase<TInput, TOutput>');
    expect(API).toContain('execute');
  });

  it('documents createHexApp', () => {
    expect(API).toContain('createHexApp');
    expect(API).toContain('HexAppOptions');
    expect(API).toContain('httpAdapter');
    expect(API).toContain('HttpAdapterOptions');
    expect(API).toContain('ExecuteResult');
  });

  it('documents lifecycle hooks', () => {
    expect(API).toContain('HookContext');
    expect(API).toContain('beforeExecute');
    expect(API).toContain('afterExecute');
    expect(API).toContain('onError');
  });
});

describe('patterns resource', () => {
  it('shows port definition pattern', () => {
    expect(PATTERNS).toContain("Port<");
    expect(PATTERNS).toContain('UseCase<');
    expect(PATTERNS).toContain('inbound');
    expect(PATTERNS).toContain('outbound');
  });

  it('shows use case implementation', () => {
    expect(PATTERNS).toContain('implements');
    expect(PATTERNS).toContain('constructor');
  });

  it('shows container binding', () => {
    expect(PATTERNS).toContain('createContainer');
    expect(PATTERNS).toContain('container.bind');
    expect(PATTERNS).toContain('container.validate');
  });

  it('shows httpAdapter usage', () => {
    expect(PATTERNS).toContain('hex.httpAdapter');
    expect(PATTERNS).toContain('toInput');
  });

  it('mentions third-party DI escape hatch', () => {
    expect(PATTERNS).toContain('Third-Party DI');
  });
});

describe('project-structure resource', () => {
  it('shows folder layout', () => {
    expect(PROJECT_STRUCTURE).toContain('domain/ports/inbound');
    expect(PROJECT_STRUCTURE).toContain('domain/ports/outbound');
    expect(PROJECT_STRUCTURE).toContain('domain/use-cases');
    expect(PROJECT_STRUCTURE).toContain('domain/models');
    expect(PROJECT_STRUCTURE).toContain('infrastructure/persistence');
    expect(PROJECT_STRUCTURE).toContain('infrastructure/http');
    expect(PROJECT_STRUCTURE).toContain('infrastructure/services');
  });

  it('explains dependency direction rule', () => {
    expect(PROJECT_STRUCTURE).toContain('never imports from infrastructure');
  });
});

describe('errors resource', () => {
  it('shows error hierarchy', () => {
    expect(ERRORS).toContain('BusinessError');
    expect(ERRORS).toContain('ValidationError');
    expect(ERRORS).toContain('NotFoundError');
    expect(ERRORS).toContain('ConflictError');
    expect(ERRORS).toContain('UnauthorizedError');
    expect(ERRORS).toContain('ForbiddenError');
  });

  it('shows HTTP status mapping', () => {
    expect(ERRORS).toContain('400');
    expect(ERRORS).toContain('404');
    expect(ERRORS).toContain('409');
    expect(ERRORS).toContain('401');
    expect(ERRORS).toContain('403');
  });

  it('shows custom error subclass example', () => {
    expect(ERRORS).toContain('extends ConflictError');
    expect(ERRORS).toContain('OrderAlreadyShippedError');
  });

  it('shows errorMap override', () => {
    expect(ERRORS).toContain('errorMap');
    expect(ERRORS).toContain('createHexApp');
  });
});

describe('http-adapters resource', () => {
  it('documents framework selection', () => {
    expect(HTTP_ADAPTERS).toContain("framework: 'express'");
    expect(HTTP_ADAPTERS).toContain("framework: 'fastify'");
    expect(HTTP_ADAPTERS).toContain("framework: 'hono'");
  });

  it('shows examples for all three frameworks', () => {
    expect(HTTP_ADAPTERS).toContain('express');
    expect(HTTP_ADAPTERS).toContain('Fastify');
    expect(HTTP_ADAPTERS).toContain('Hono');
  });

  it('documents default status codes', () => {
    expect(HTTP_ADAPTERS).toContain('POST');
    expect(HTTP_ADAPTERS).toContain('201');
    expect(HTTP_ADAPTERS).toContain('DELETE');
    expect(HTTP_ADAPTERS).toContain('204');
  });

  it('documents hex.execute fallback', () => {
    expect(HTTP_ADAPTERS).toContain('hex.execute');
  });

  it('documents custom FrameworkStrategy', () => {
    expect(HTTP_ADAPTERS).toContain('FrameworkStrategy');
    expect(HTTP_ADAPTERS).toContain('createHandler');
  });
});

describe('decorators resource', () => {
  it('documents @Injectable and @Inject', () => {
    expect(DECORATORS).toContain('@Injectable');
    expect(DECORATORS).toContain('@Inject');
  });

  it('documents withDecorators', () => {
    expect(DECORATORS).toContain('withDecorators');
    expect(DECORATORS).toContain('DecoratorContainer');
  });

  it('documents clearRegistry', () => {
    expect(DECORATORS).toContain('clearRegistry');
  });

  it('documents lifecycle options', () => {
    expect(DECORATORS).toContain('singleton');
    expect(DECORATORS).toContain('transient');
    expect(DECORATORS).toContain('scoped');
  });

  it('mentions no reflect-metadata needed', () => {
    expect(DECORATORS).toContain('reflect-metadata');
    expect(DECORATORS).toContain('experimentalDecorators');
  });
});

describe('ddd resource', () => {
  it('documents ValueObject', () => {
    expect(DDD).toContain('ValueObject');
    expect(DDD).toContain('validate');
    expect(DDD).toContain('equals');
    expect(DDD).toContain('Object.freeze');
  });

  it('documents Entity', () => {
    expect(DDD).toContain('Entity<');
    expect(DDD).toContain('super(id)');
  });

  it('documents AggregateRoot', () => {
    expect(DDD).toContain('AggregateRoot');
    expect(DDD).toContain('addEvent');
    expect(DDD).toContain('getEvents');
    expect(DDD).toContain('clearEvents');
  });

  it('documents DomainEvent', () => {
    expect(DDD).toContain('DomainEvent');
    expect(DDD).toContain('eventName');
    expect(DDD).toContain('aggregateId');
    expect(DDD).toContain('occurredAt');
    expect(DDD).toContain('timestampFactory');
  });

  it('shows beebear integration example', () => {
    expect(DDD).toContain("import { AggregateRoot } from '@beebear-plugins/ddd'");
    expect(DDD).toContain("import type { UseCase } from 'beebear'");
  });
});
