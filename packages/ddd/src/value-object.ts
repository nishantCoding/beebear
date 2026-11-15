export abstract class ValueObject<TProps extends Record<string, unknown>> {
  protected readonly props: Readonly<TProps>;

  constructor(props: TProps) {
    this.validate(props);
    this.props = Object.freeze({ ...props });
  }

  protected validate(_props: TProps): void {}

  equals(other: ValueObject<TProps>): boolean {
    if (other === null || other === undefined) return false;
    if (this.constructor !== other.constructor) return false;

    const keys = Object.keys(this.props) as Array<keyof TProps>;
    for (const key of keys) {
      if (this.props[key] !== other.props[key]) return false;
    }
    return true;
  }
}
