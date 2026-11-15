export abstract class DomainEvent {
  readonly eventName!: string;
  readonly aggregateId!: string | number;
  readonly occurredAt!: Date | string | number;

  constructor(
    eventName: string,
    aggregateId: string | number,
    timestampFactory?: () => Date | string | number,
  ) {
    Object.defineProperty(this, 'eventName', {
      value: eventName,
      writable: false,
      enumerable: true,
      configurable: false,
    });
    Object.defineProperty(this, 'aggregateId', {
      value: aggregateId,
      writable: false,
      enumerable: true,
      configurable: false,
    });
    Object.defineProperty(this, 'occurredAt', {
      value: timestampFactory ? timestampFactory() : new Date(),
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }
}
