/**
 * Stock valuation, the one calculation every screen uses (Dashboard, Inventory, Reports).
 *
 * Value is built from batches: remaining quantity x the batch's unit cost, summed. A batch whose cost is unknown (null) is
 * not valued at all, and a batch with a confirmed cost of 0 (free goods) is valued at 0. Stock with no known cost is
 * reported as a quantity, never as a guessed amount, and the valuation is flagged incomplete while any exists. The item's own
 * cost per unit is not used here.
 */

export interface ValuationInput {
  id: string;
  /** What the item's on-hand number says. */
  stockCount: number;
  /** Batches with stock left (any status: expired and quarantined stock is still on the shelf and still has a cost). */
  batches: { remainingQuantity: number; unitCost: number | null }[];
}

export interface ItemValuation {
  /** Remaining quantity x unit cost over batches whose cost is known. */
  knownValue: number;
  knownQuantity: number;
  /** Stock whose cost is unknown: batches with no cost, plus stock that is in no batch. */
  unknownQuantity: number;
}

export interface StockValuation {
  items: Map<string, ItemValuation>;
  /** Value of the stock whose cost is known. Not the whole stock's value while `incomplete`. */
  totalValue: number;
  itemsWithUnknownCost: number;
  /** True while some stock has no known cost, so `totalValue` understates the real value. */
  incomplete: boolean;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export function summariseValuation(rows: ValuationInput[]): StockValuation {
  const items = new Map<string, ItemValuation>();
  let total = 0;
  let withUnknown = 0;
  for (const row of rows) {
    let knownValue = 0;
    let knownQuantity = 0;
    let unknown = 0;
    let batched = 0;
    for (const b of row.batches) {
      batched += b.remainingQuantity;
      if (b.unitCost === null) unknown += b.remainingQuantity;
      else {
        knownValue += b.remainingQuantity * b.unitCost;
        knownQuantity += b.remainingQuantity;
      }
    }
    // On hand but in no batch: its cost was never recorded.
    unknown += Math.max(0, row.stockCount - batched);
    const entry = { knownValue: round2(knownValue), knownQuantity: round3(knownQuantity), unknownQuantity: round3(unknown) };
    if (entry.unknownQuantity > 0) withUnknown += 1;
    total += knownValue;
    items.set(row.id, entry);
  }
  return { items, totalValue: round2(total), itemsWithUnknownCost: withUnknown, incomplete: withUnknown > 0 };
}
