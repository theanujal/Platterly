/**
 * Chunk 22.1 — the Inventory report's arithmetic (PRD §51 Inventory): stock value, low stock, what is expiring, stock
 * movements and purchases. Pure functions over plain rows. Stock value is a snapshot of today (stock x cost per unit);
 * movements and purchases follow the date range.
 */
export interface StockRow {
  id: string;
  name: string;
  category: string;
  unit: string;
  stock: number;
  /** Value of the batches whose cost is known (shared valuation, inventory/valuation-math.ts). */
  knownValue: number;
  /** Stock whose cost is unknown: not valued, reported as a quantity. */
  unknownQuantity: number;
  lowStockThreshold: number | null;
  /** The earliest expiry among batches with stock left. */
  expiryDate: Date | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface StockReport {
  items: number;
  /** Value of stock with a known cost. Understates the total while `incomplete`. */
  totalValue: number;
  itemsWithUnknownCost: number;
  incomplete: boolean;
  byCategory: { category: string; items: number; value: number; unknownCostItems: number }[];
  lowStock: { id: string; name: string; unit: string; stock: number; threshold: number }[];
  expiring: { id: string; name: string; unit: string; stock: number; expiryDate: Date; daysLeft: number }[];
}

export function computeStock(rows: StockRow[], now: Date = new Date(), expiryDays = 30): StockReport {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const categories = new Map<string, { items: number; value: number; unknownCostItems: number }>();
  let totalValue = 0;
  let itemsWithUnknownCost = 0;
  for (const row of rows) {
    if (row.unknownQuantity > 0) itemsWithUnknownCost += 1;
    totalValue += row.knownValue;
    const entry = categories.get(row.category) ?? { items: 0, value: 0, unknownCostItems: 0 };
    entry.items += 1;
    entry.value += row.knownValue;
    if (row.unknownQuantity > 0) entry.unknownCostItems += 1;
    categories.set(row.category, entry);
  }
  return {
    items: rows.length,
    totalValue: round2(totalValue),
    itemsWithUnknownCost,
    incomplete: itemsWithUnknownCost > 0,
    byCategory: [...categories.entries()].map(([category, v]) => ({ category, items: v.items, value: round2(v.value), unknownCostItems: v.unknownCostItems })).sort((a, b) => b.value - a.value),
    lowStock: rows
      .filter((r) => r.lowStockThreshold !== null && r.stock <= r.lowStockThreshold)
      .map((r) => ({ id: r.id, name: r.name, unit: r.unit, stock: r.stock, threshold: r.lowStockThreshold! }))
      .sort((a, b) => a.stock / (a.threshold || 1) - b.stock / (b.threshold || 1)),
    expiring: rows
      .filter((r) => r.expiryDate && r.stock > 0)
      .map((r) => ({ id: r.id, name: r.name, unit: r.unit, stock: r.stock, expiryDate: r.expiryDate!, daysLeft: Math.round((Date.UTC(r.expiryDate!.getUTCFullYear(), r.expiryDate!.getUTCMonth(), r.expiryDate!.getUTCDate()) - today) / DAY_MS) }))
      .filter((r) => r.daysLeft <= expiryDays)
      .sort((a, b) => a.daysLeft - b.daysLeft),
  };
}

export interface MovementRow {
  type: "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT";
  /** Positive for in and out; signed for an adjustment. */
  quantity: number;
  inventoryId: string;
  name: string;
  unit: string;
  /** What the movement actually cost, from its batch allocations that have a known cost (never from the item's current cost). */
  actualCost: number;
  /** The part of the movement with no known cost: no batch allocation (it happened before batches) or an unknown-cost batch. */
  unknownQuantity: number;
  /** The item's current cost, used only for the separate estimate. */
  estimateCostPerUnit: number | null;
  forOrder: boolean;
}
export interface MovementReport {
  movements: number;
  /** Actual costs only. Movements with an unknown cost are left out of these and counted below. */
  stockInValue: number;
  stockOutValue: number;
  adjustmentValue: number;
  /** Movements that have some quantity with no known cost, so the values above are incomplete. */
  unknownCostMovements: number;
  /** An estimate for those quantities at today's item cost. Not actual cost and not part of any total above. */
  estimatedUnknownValue: number;
  takenForOrders: number;
  busiest: { name: string; unit: string; inQty: number; outQty: number; moves: number }[];
}

export function computeMovements(rows: MovementRow[], top = 10): MovementReport {
  let inValue = 0;
  let outValue = 0;
  let adjValue = 0;
  let forOrders = 0;
  let unknownMovements = 0;
  let estimate = 0;
  const items = new Map<string, { name: string; unit: string; inQty: number; outQty: number; moves: number }>();
  for (const row of rows) {
    const entry = items.get(row.inventoryId) ?? { name: row.name, unit: row.unit, inQty: 0, outQty: 0, moves: 0 };
    entry.moves += 1;
    if (row.unknownQuantity > 0) {
      unknownMovements += 1;
      estimate += row.unknownQuantity * (row.estimateCostPerUnit ?? 0);
    }
    if (row.type === "STOCK_IN") {
      inValue += row.actualCost;
      entry.inQty += row.quantity;
    } else if (row.type === "STOCK_OUT") {
      outValue += row.actualCost;
      entry.outQty += row.quantity;
      if (row.forOrder) forOrders += 1;
    } else {
      adjValue += row.quantity >= 0 ? row.actualCost : -row.actualCost;
      if (row.quantity >= 0) entry.inQty += row.quantity;
      else entry.outQty += -row.quantity;
    }
    items.set(row.inventoryId, entry);
  }
  return {
    movements: rows.length,
    stockInValue: round2(inValue),
    stockOutValue: round2(outValue),
    adjustmentValue: round2(adjValue),
    unknownCostMovements: unknownMovements,
    estimatedUnknownValue: round2(estimate),
    takenForOrders: forOrders,
    busiest: [...items.values()].sort((a, b) => b.moves - a.moves || a.name.localeCompare(b.name)).slice(0, top),
  };
}

export interface PurchaseLine {
  supplierId: string;
  supplierName: string;
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
  /** What the received stock cost: the price on each receipt, plus older stock at the line's own cost. */
  receivedValue: number;
}
export interface PurchaseReport {
  orderedValue: number;
  receivedValue: number;
  stillToReceive: number;
  orders: number;
  /** Orders raised without prices (the actual cost is entered on receiving), so they add nothing to the ordered value. */
  unpricedOrders: number;
  bySupplier: { supplierId: string; supplierName: string; orders: number; orderedValue: number; receivedValue: number }[];
}

/** `orders` is one entry per purchase order (already limited to the range, drafts and cancelled left out). */
export function computePurchases(orders: { id: string; lines: PurchaseLine[] }[]): PurchaseReport {
  const suppliers = new Map<string, { supplierName: string; orders: Set<string>; orderedValue: number; receivedValue: number }>();
  let ordered = 0;
  let received = 0;
  let outstanding = 0;
  for (const order of orders) {
    for (const line of order.lines) {
      const o = line.quantity * line.unitCost;
      const r = line.receivedValue;
      ordered += o;
      received += r;
      // Still to arrive, only where the order has a price to value it at.
      if (line.unitCost > 0) outstanding += Math.max(o - r, 0);
      const s = suppliers.get(line.supplierId) ?? { supplierName: line.supplierName, orders: new Set<string>(), orderedValue: 0, receivedValue: 0 };
      s.orders.add(order.id);
      s.orderedValue += o;
      s.receivedValue += r;
      suppliers.set(line.supplierId, s);
    }
  }
  return {
    orderedValue: round2(ordered),
    receivedValue: round2(received),
    stillToReceive: round2(outstanding),
    orders: orders.length,
    unpricedOrders: orders.filter((o) => o.lines.every((l) => !(l.unitCost > 0))).length,
    bySupplier: [...suppliers.entries()]
      .map(([supplierId, s]) => ({ supplierId, supplierName: s.supplierName, orders: s.orders.size, orderedValue: round2(s.orderedValue), receivedValue: round2(s.receivedValue) }))
      .sort((a, b) => b.orderedValue - a.orderedValue),
  };
}

const count = new Intl.NumberFormat("en-IN");
const rupees = (n: number) => `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)}`;

/** The note under the Stock value figure, the same wherever the report is shown. */
export function stockValueHint(stock: StockReport): string {
  return stock.incomplete
    ? `Incomplete: ${count.format(stock.itemsWithUnknownCost)} ${stock.itemsWithUnknownCost === 1 ? "item has" : "items have"} stock with no known cost, which is not valued`
    : "Batch cost x quantity left, as of today";
}

/** The note about movements whose cost was never recorded; the estimate is only a guide and is in none of the totals. */
export function movementCostHint(movements: MovementReport): string | undefined {
  if (movements.unknownCostMovements === 0) return undefined;
  const estimate = movements.estimatedUnknownValue > 0 ? ` At today's item cost they would be about ${rupees(movements.estimatedUnknownValue)} (an estimate, not included).` : "";
  return `${count.format(movements.unknownCostMovements)} ${movements.unknownCostMovements === 1 ? "movement has" : "movements have"} no recorded cost and ${movements.unknownCostMovements === 1 ? "is" : "are"} left out.${estimate}`;
}
