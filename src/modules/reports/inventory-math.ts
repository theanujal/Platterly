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
  costPerUnit: number | null;
  lowStockThreshold: number | null;
  expiryDate: Date | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface StockReport {
  items: number;
  totalValue: number;
  itemsWithoutCost: number;
  byCategory: { category: string; items: number; value: number }[];
  lowStock: { id: string; name: string; unit: string; stock: number; threshold: number }[];
  expiring: { id: string; name: string; unit: string; stock: number; expiryDate: Date; daysLeft: number }[];
}

export function computeStock(rows: StockRow[], now: Date = new Date(), expiryDays = 30): StockReport {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const categories = new Map<string, { items: number; value: number }>();
  let totalValue = 0;
  let itemsWithoutCost = 0;
  for (const row of rows) {
    const value = row.costPerUnit === null ? 0 : row.stock * row.costPerUnit;
    if (row.costPerUnit === null) itemsWithoutCost += 1;
    totalValue += value;
    const entry = categories.get(row.category) ?? { items: 0, value: 0 };
    entry.items += 1;
    entry.value += value;
    categories.set(row.category, entry);
  }
  return {
    items: rows.length,
    totalValue: round2(totalValue),
    itemsWithoutCost,
    byCategory: [...categories.entries()].map(([category, v]) => ({ category, items: v.items, value: round2(v.value) })).sort((a, b) => b.value - a.value),
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
  costPerUnit: number | null;
  forOrder: boolean;
}
export interface MovementReport {
  movements: number;
  stockInValue: number;
  stockOutValue: number;
  adjustmentValue: number;
  takenForOrders: number;
  busiest: { name: string; unit: string; inQty: number; outQty: number; moves: number }[];
}

export function computeMovements(rows: MovementRow[], top = 10): MovementReport {
  let inValue = 0;
  let outValue = 0;
  let adjValue = 0;
  let forOrders = 0;
  const items = new Map<string, { name: string; unit: string; inQty: number; outQty: number; moves: number }>();
  for (const row of rows) {
    const value = (row.costPerUnit ?? 0) * Math.abs(row.quantity);
    const entry = items.get(row.inventoryId) ?? { name: row.name, unit: row.unit, inQty: 0, outQty: 0, moves: 0 };
    entry.moves += 1;
    if (row.type === "STOCK_IN") {
      inValue += value;
      entry.inQty += row.quantity;
    } else if (row.type === "STOCK_OUT") {
      outValue += value;
      entry.outQty += row.quantity;
      if (row.forOrder) forOrders += 1;
    } else {
      adjValue += (row.costPerUnit ?? 0) * row.quantity;
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
}
export interface PurchaseReport {
  orderedValue: number;
  receivedValue: number;
  stillToReceive: number;
  orders: number;
  bySupplier: { supplierId: string; supplierName: string; orders: number; orderedValue: number; receivedValue: number }[];
}

/** `orders` is one entry per purchase order (already limited to the range, drafts and cancelled left out). */
export function computePurchases(orders: { id: string; lines: PurchaseLine[] }[]): PurchaseReport {
  const suppliers = new Map<string, { supplierName: string; orders: Set<string>; orderedValue: number; receivedValue: number }>();
  let ordered = 0;
  let received = 0;
  for (const order of orders) {
    for (const line of order.lines) {
      const o = line.quantity * line.unitCost;
      const r = line.receivedQuantity * line.unitCost;
      ordered += o;
      received += r;
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
    stillToReceive: round2(Math.max(ordered - received, 0)),
    orders: orders.length,
    bySupplier: [...suppliers.entries()]
      .map(([supplierId, s]) => ({ supplierId, supplierName: s.supplierName, orders: s.orders.size, orderedValue: round2(s.orderedValue), receivedValue: round2(s.receivedValue) }))
      .sort((a, b) => b.orderedValue - a.orderedValue),
  };
}
