/**
 * Events for one business carry a sequence number that only goes up. A consumer remembers the highest it has applied for each
 * business and ignores anything not higher, so a duplicate or out-of-order delivery changes nothing.
 */
export function isSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

/** `lastApplied` is null for a business the consumer has not seen an event for yet. */
export function shouldApply(lastApplied: number | null, incoming: number): boolean {
  return isSequence(incoming) && (lastApplied === null || incoming > lastApplied);
}
