/**
 * Chunk 22.1 — the Menu report's arithmetic (PRD §51 Menu): which dishes are picked most and least, and how each Menu
 * Type performs. Pure functions over plain rows, so every figure is unit-tested. ("Package performance" in the PRD
 * is Menu Type performance here: packages no longer exist after the Chunk 6 catalog rework.)
 */
export interface MenuReportMeal {
  menuId: string | null;
  menuName: string | null;
  /** Dishes picked for this meal (add-ons excluded). `id` is null when the catalog dish was deleted since. */
  dishes: { id: string | null; name: string; isExtra: boolean }[];
}
export interface MenuReportOrder {
  id: string;
  total: number;
  meals: MenuReportMeal[];
}

export interface DishRow {
  key: string;
  name: string;
  /** In how many orders the dish was picked. */
  orders: number;
  /** In how many of those it was an Extra (charged on top of the menu). */
  asExtra: number;
}
export interface MenuTypeRow {
  menuId: string;
  name: string;
  orders: number;
  meals: number;
  /** An order using several Menu Types shares its total evenly between them, so the rows add up to the real revenue. */
  revenue: number;
  avgPerOrder: number;
  sharePercent: number;
}
export interface MenuReport {
  ordersCounted: number;
  distinctDishes: number;
  mostSelected: DishRow[];
  leastSelected: DishRow[];
  neverPicked: { total: number; names: string[] };
  menuTypes: MenuTypeRow[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeMenuReport(orders: MenuReportOrder[], catalog: { id: string; name: string; isActive: boolean }[], top = 10): MenuReport {
  const dishes = new Map<string, DishRow>();
  const menus = new Map<string, { name: string; orders: Set<string>; meals: number; revenue: number }>();

  for (const order of orders) {
    const seenDishes = new Set<string>();
    const orderMenus = new Set<string>();
    for (const meal of order.meals) {
      if (meal.menuId) orderMenus.add(meal.menuId);
      for (const dish of meal.dishes) {
        const key = dish.id ?? `name:${dish.name.toLowerCase()}`;
        const row = dishes.get(key) ?? { key, name: dish.name, orders: 0, asExtra: 0 };
        if (!seenDishes.has(key)) {
          row.orders += 1;
          seenDishes.add(key);
        }
        if (dish.isExtra) row.asExtra += 1;
        dishes.set(key, row);
      }
    }
    const share = orderMenus.size > 0 ? order.total / orderMenus.size : 0;
    for (const meal of order.meals) {
      if (!meal.menuId) continue;
      const entry = menus.get(meal.menuId) ?? { name: meal.menuName ?? "Menu", orders: new Set<string>(), meals: 0, revenue: 0 };
      entry.meals += 1;
      if (!entry.orders.has(order.id)) {
        entry.orders.add(order.id);
        entry.revenue += share;
      }
      menus.set(meal.menuId, entry);
    }
  }

  const byPopularity = (a: DishRow, b: DishRow) => b.orders - a.orders || a.name.localeCompare(b.name);
  const rows = [...dishes.values()];
  const picked = new Set(rows.map((row) => row.key));
  const unpicked = catalog.filter((item) => item.isActive && !picked.has(item.id)).map((item) => item.name).sort((a, b) => a.localeCompare(b));
  const totalMenuOrders = [...menus.values()].reduce((sum, m) => sum + m.orders.size, 0);

  return {
    ordersCounted: orders.length,
    distinctDishes: rows.length,
    mostSelected: [...rows].sort(byPopularity).slice(0, top),
    leastSelected: [...rows].sort((a, b) => a.orders - b.orders || a.name.localeCompare(b.name)).slice(0, top),
    neverPicked: { total: unpicked.length, names: unpicked.slice(0, top) },
    menuTypes: [...menus.entries()]
      .map(([menuId, m]) => ({
        menuId,
        name: m.name,
        orders: m.orders.size,
        meals: m.meals,
        revenue: round2(m.revenue),
        avgPerOrder: m.orders.size ? round2(m.revenue / m.orders.size) : 0,
        sharePercent: totalMenuOrders ? Math.round((m.orders.size / totalMenuOrders) * 100) : 0,
      }))
      .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue),
  };
}
