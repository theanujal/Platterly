/**
 * The one FIFO allocation rule (pure, so the server and the recipe dialog share it).
 *
 * Given the usable stock of an item in the order it would be used (unbatched stock first, then batches oldest first), take
 * `quantity` from the front and say what came from where, at which unit cost. It changes nothing: actual consumption applies
 * the slices it returns to the batches and records them; a recipe preview only reads them. A batch with an unknown cost
 * (`unitCost` null) is used in its turn, never skipped, so a later known cost cannot stand in for it. A confirmed cost of 0 is a
 * known cost.
 */

export interface PlanBatch {
  /** null = stock that is in no batch (its cost is unknown). */
  id: string | null;
  remaining: number;
  unitCost: number | null;
}

export interface PlanSlice {
  batchId: string | null;
  quantity: number;
  unitCost: number | null;
}

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export function planFifo(queue: PlanBatch[], quantity: number): { slices: PlanSlice[]; shortfall: number } {
  const slices: PlanSlice[] = [];
  let need = round3(quantity);
  for (const batch of queue) {
    if (need <= 0) break;
    if (!(batch.remaining > 0)) continue;
    const take = round3(Math.min(need, batch.remaining));
    slices.push({ batchId: batch.id, quantity: take, unitCost: batch.unitCost });
    need = round3(need - take);
  }
  return { slices, shortfall: Math.max(0, need) };
}
