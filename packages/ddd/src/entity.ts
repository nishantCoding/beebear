export abstract class Entity<TId extends string | number> {
  readonly id!: TId;

  constructor(id: TId) {
    Object.defineProperty(this, 'id', {
      value: id,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }

  equals(other: Entity<TId>): boolean {
    if (other === null || other === undefined) return false;
    if (this.constructor !== other.constructor) return false;
    return this.id === other.id;
  }
}
