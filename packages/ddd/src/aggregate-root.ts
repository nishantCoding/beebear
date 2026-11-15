import { Entity } from './entity.js';
import type { DomainEvent } from './domain-event.js';

export abstract class AggregateRoot<TId extends string | number> extends Entity<TId> {
  private _events: DomainEvent[] = [];

  protected addEvent(event: DomainEvent): void {
    this._events.push(event);
  }

  getEvents(): ReadonlyArray<DomainEvent> {
    return [...this._events];
  }

  clearEvents(): void {
    this._events.length = 0;
  }
}
