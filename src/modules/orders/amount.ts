/** A percentage of an amount, to the paisa. Used by the server's order totals and by the order form's live total so they always agree. */
export function percentOf(amount: number, rate: number): number {
  return Math.round(amount * rate) / 100;
}
