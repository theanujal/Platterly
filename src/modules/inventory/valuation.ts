import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { summariseValuation, type StockValuation } from "./valuation-math";

export type { ItemValuation, StockValuation } from "./valuation-math";

/** The shared stock valuation for the items matching `where` (a kitchen, optionally one location). See valuation-math.ts for the rules. */
export async function valueStock(organizationId: string, where: Prisma.InventoryWhereInput = {}): Promise<StockValuation> {
  const items = await prisma.inventory.findMany({
    where: { organizationId, ...where },
    select: { id: true, stockCount: true, stockBatches: { where: { remainingQuantity: { gt: 0 } }, select: { remainingQuantity: true, unitCost: true } } },
  });
  return summariseValuation(
    items.map((i) => ({
      id: i.id,
      stockCount: Number(i.stockCount),
      batches: i.stockBatches.map((b) => ({ remainingQuantity: Number(b.remainingQuantity), unitCost: b.unitCost === null ? null : Number(b.unitCost) })),
    })),
  );
}
