/**
 * Standard contract for all use cases in a beebear application.
 *
 * Implementing classes can have additional private/protected helper methods —
 * the interface only constrains the public contract.
 */
export interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
