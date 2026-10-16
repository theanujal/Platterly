// Client-safe: PRD §42's profit math, in one place so the Order tab, the Profitability page and the tests agree.
export type OrderExpenseCategory = "FOOD" | "LABOUR" | "TRANSPORT" | "EQUIPMENT" | "VENUE" | "MISC";
export type CompanyExpenseCategory = "RENT" | "SALARIES" | "UTILITIES" | "MARKETING" | "MAINTENANCE" | "LICENCES_FEES" | "MISC";
export type ExpenseCategoryValue = OrderExpenseCategory | CompanyExpenseCategory;

/** An order's expenses (PRD §41); these are the categories profit is broken down by. */
export const EXPENSE_CATEGORIES: OrderExpenseCategory[] = ["FOOD", "LABOUR", "TRANSPORT", "EQUIPMENT", "VENUE", "MISC"];
/** Company (overhead) expenses, not tied to an order (AJ, 2026-10-03). */
export const COMPANY_EXPENSE_CATEGORIES: CompanyExpenseCategory[] = ["RENT", "SALARIES", "UTILITIES", "MARKETING", "MAINTENANCE", "LICENCES_FEES", "MISC"];

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategoryValue, string> = {
  FOOD: "Food",
  LABOUR: "Labour",
  TRANSPORT: "Transport",
  EQUIPMENT: "Equipment",
  VENUE: "Venue",
  MISC: "Miscellaneous",
  RENT: "Rent",
  SALARIES: "Salaries",
  UTILITIES: "Utilities",
  MARKETING: "Marketing",
  MAINTENANCE: "Maintenance",
  LICENCES_FEES: "Licences & fees",
};

export interface Profitability {
  revenue: number;
  totalCost: number;
  profit: number;
  /** Profit as a % of revenue; null when there is no revenue to divide by. */
  marginPercent: number | null;
  /** Food expenses as a % of revenue; null when there is no revenue. */
  foodCostPercent: number | null;
  byCategory: Record<OrderExpenseCategory, number>;
  /** The part of Food that is the cost of the inventory sent to the order (the rest is recorded Food expenses). */
  inventoryFoodCost: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Revenue is the order total (AJ, 2026-10-03), whatever has been paid so far. */
export function computeProfitability(revenue: number, expenses: { category: ExpenseCategoryValue; amount: number }[], inventoryFoodCost = 0): Profitability {
  const byCategory = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0])) as Record<OrderExpenseCategory, number>;
  for (const e of expenses) if (e.category in byCategory) byCategory[e.category as OrderExpenseCategory] = round2(byCategory[e.category as OrderExpenseCategory] + e.amount);
  // Food cost follows the inventory sent to the order (AJ, 2026-10-16), on top of any Food expense recorded by hand.
  byCategory.FOOD = round2(byCategory.FOOD + inventoryFoodCost);
  const totalCost = round2(EXPENSE_CATEGORIES.reduce((sum, c) => sum + byCategory[c], 0));
  const rev = round2(revenue);
  return {
    revenue: rev,
    totalCost,
    profit: round2(rev - totalCost),
    marginPercent: rev > 0 ? round2(((rev - totalCost) / rev) * 100) : null,
    foodCostPercent: rev > 0 ? round2((byCategory.FOOD / rev) * 100) : null,
    byCategory,
    inventoryFoodCost: round2(inventoryFoodCost),
  };
}
