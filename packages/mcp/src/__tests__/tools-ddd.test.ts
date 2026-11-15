import { describe, it, expect } from 'vitest';
import { scaffoldEntity, handleScaffoldEntity } from '../tools/scaffold-entity.js';
import { scaffoldValueObject, handleScaffoldValueObject } from '../tools/scaffold-value-object.js';
import { scaffoldAggregate, handleScaffoldAggregate } from '../tools/scaffold-aggregate.js';
import { scaffoldEventPublisher } from '../tools/scaffold-event-publisher.js';

describe('scaffold_entity', () => {
  it('generates entity with properties', () => {
    const result = scaffoldEntity({
      name: 'OrderItem',
      idType: 'string',
      properties: [
        { name: 'productId', type: 'string' },
        { name: 'quantity', type: 'number' },
      ],
    });
    expect(result).toContain("import { Entity } from '@beebear-plugins/ddd'");
    expect(result).toContain('class OrderItem extends Entity<string>');
    expect(result).toContain('super(id)');
    expect(result).toContain('public productId: string');
    expect(result).toContain('public quantity: number');
  });

  it('generates entity without properties', () => {
    const result = scaffoldEntity({ name: 'User', idType: 'number' });
    expect(result).toContain('class User extends Entity<number>');
    expect(result).toContain('id: number');
  });

  it('supports readonly properties', () => {
    const result = scaffoldEntity({
      name: 'User',
      idType: 'string',
      properties: [{ name: 'email', type: 'string', readonly: true }],
    });
    expect(result).toContain('public readonly email: string');
  });

  it('rejects non-PascalCase name', () => {
    const result = handleScaffoldEntity({ name: 'orderItem', idType: 'string' });
    expect(result.isError).toBe(true);
  });
});

describe('scaffold_value_object', () => {
  it('generates value object with props and getters', () => {
    const result = scaffoldValueObject({
      name: 'Money',
      props: [
        { name: 'amount', type: 'number' },
        { name: 'currency', type: 'string' },
      ],
    });
    expect(result).toContain("import { ValueObject } from '@beebear-plugins/ddd'");
    expect(result).toContain('interface MoneyProps');
    expect(result).toContain('amount: number');
    expect(result).toContain('class Money extends ValueObject<MoneyProps>');
    expect(result).toContain('get amount() { return this.props.amount; }');
    expect(result).toContain('get currency() { return this.props.currency; }');
  });

  it('includes validation rules as TODOs', () => {
    const result = scaffoldValueObject({
      name: 'Money',
      props: [{ name: 'amount', type: 'number' }],
      validationRules: ['amount must be >= 0'],
    });
    expect(result).toContain('// TODO: amount must be >= 0');
  });

  it('rejects empty props', () => {
    const result = handleScaffoldValueObject({ name: 'Empty', props: [] });
    expect(result.isError).toBe(true);
  });
});

describe('scaffold_aggregate', () => {
  it('generates aggregate with events', () => {
    const result = scaffoldAggregate({
      name: 'Order',
      idType: 'string',
      events: [
        {
          name: 'OrderPlaced',
          fields: [{ name: 'total', type: 'number' }],
        },
        {
          name: 'ItemAdded',
          fields: [{ name: 'productId', type: 'string' }],
        },
      ],
    });
    expect(result).toContain("import { AggregateRoot, DomainEvent } from '@beebear-plugins/ddd'");
    expect(result).toContain('class OrderPlaced extends DomainEvent');
    expect(result).toContain('class ItemAdded extends DomainEvent');
    expect(result).toContain('class Order extends AggregateRoot<string>');
    expect(result).toContain('this.addEvent(new OrderPlaced(');
    expect(result).toContain('this.addEvent(new ItemAdded(');
  });

  it('generates aggregate without events', () => {
    const result = scaffoldAggregate({ name: 'Cart', idType: 'string' });
    expect(result).toContain('class Cart extends AggregateRoot<string>');
    expect(result).toContain('// TODO: add domain methods');
  });

  it('rejects non-PascalCase event name', () => {
    const result = handleScaffoldAggregate({
      name: 'Order',
      idType: 'string',
      events: [{ name: 'orderPlaced' }],
    });
    expect(result.isError).toBe(true);
  });
});

describe('scaffold_event_publisher', () => {
  it('generates RabbitMQ adapter', () => {
    const result = scaffoldEventPublisher({ transport: 'rabbitmq' });
    expect(result).toContain('interface EventPublisher');
    expect(result).toContain("Port<EventPublisher>('EventPublisher')");
    expect(result).toContain('class RabbitMQEventPublisher');
    expect(result).toContain('channel.publish');
  });

  it('generates Kafka adapter', () => {
    const result = scaffoldEventPublisher({ transport: 'kafka' });
    expect(result).toContain('class KafkaEventPublisher');
    expect(result).toContain('producer.sendBatch');
  });

  it('generates SQS adapter', () => {
    const result = scaffoldEventPublisher({ transport: 'sqs' });
    expect(result).toContain('class SQSEventPublisher');
    expect(result).toContain('sqs.sendMessage');
  });

  it('generates outbox adapter', () => {
    const result = scaffoldEventPublisher({ transport: 'outbox' });
    expect(result).toContain('class OutboxEventPublisher');
    expect(result).toContain('outboxEvents.insertMany');
  });
});
