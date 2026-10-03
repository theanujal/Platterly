import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder } from "@/modules/orders/order";
import { createCustomer } from "@/modules/customers/customer";
import { computeProfitability } from "../profitability";
import { ExpenseError, createExpense, deleteExpense, getOrderProfitability, listExpenses, listOrderExpenses, listOrderOptions, listProfitability, updateExpense } from "../expense";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

async function makeOrder(total = 10000) {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Expense Kitchen", slug: `exp-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Team", email: `t-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const customer = await createCustomer(org.id, { name: "Anoop Jalota", phone: `98${Math.floor(10000000 + Math.random() * 89999999)}` }, actor.id);
  const order = await createOrder(
    org.id,
    {
      customerId: customer.id,
      eventStartDate: new Date("2026-12-05"),
      eventEndDate: new Date("2026-12-05"),
      totalParticipants: 100,
      individualPricingEnabled: true,
      mealPlanEntries: [{ date: new Date("2026-12-05"), mealType: "DINNER", price: total }],
    },
    actor.id,
  );
  return { org, actor, order };
}

const day = new Date("2026-12-05");

describe("profitability math (PRD §42)", () => {
  it("is revenue minus every category, with margin and food-cost %", () => {
    const p = computeProfitability(10000, [
      { category: "FOOD", amount: 3000 },
      { category: "FOOD", amount: 500 },
      { category: "LABOUR", amount: 1500 },
      { category: "TRANSPORT", amount: 500 },
      { category: "EQUIPMENT", amount: 300 },
      { category: "VENUE", amount: 200 },
      { category: "MISC", amount: 100 },
    ]);
    expect(p.totalCost).toBe(6100);
    expect(p.profit).toBe(3900);
    expect(p.marginPercent).toBe(39);
    expect(p.foodCostPercent).toBe(35);
    expect(p.byCategory.FOOD).toBe(3500);
    expect(p.byCategory.MISC).toBe(100);
  });

  it("shows a loss as a negative profit", () => {
    const p = computeProfitability(1000, [{ category: "FOOD", amount: 1500 }]);
    expect(p.profit).toBe(-500);
    expect(p.marginPercent).toBe(-50);
  });

  it("has no margin or food-cost % when there is no revenue", () => {
    const p = computeProfitability(0, [{ category: "FOOD", amount: 100 }]);
    expect(p.profit).toBe(-100);
    expect(p.marginPercent).toBeNull();
    expect(p.foodCostPercent).toBeNull();
  });

  it("with no expenses the profit is the whole order total", () => {
    const p = computeProfitability(2500, []);
    expect(p.profit).toBe(2500);
    expect(p.marginPercent).toBe(100);
  });
});

describe("expenses", () => {
  it("records, edits and deletes an expense, and the order's profit follows", async () => {
    const { org, actor, order } = await makeOrder(10000);
    const food = await createExpense(org.id, order.id, { category: "FOOD", amount: 3000, spentAt: day, supplierName: " Fresh Mart ", paymentMethod: "CASH" }, actor.id);
    await createExpense(org.id, order.id, { category: "LABOUR", amount: 1000, spentAt: day }, actor.id);
    expect(food.supplierName).toBe("Fresh Mart");
    expect((await getOrderProfitability(org.id, order.id)).profit).toBe(6000);

    await updateExpense(org.id, food.id, { category: "FOOD", amount: 4000, spentAt: day }, actor.id);
    const after = await getOrderProfitability(org.id, order.id);
    expect(after.profit).toBe(5000);
    expect(after.foodCostPercent).toBe(40);

    await deleteExpense(org.id, food.id, actor.id);
    expect(await listOrderExpenses(org.id, order.id)).toHaveLength(1);
    expect((await getOrderProfitability(org.id, order.id)).profit).toBe(9000);

    const actions = (await prisma.auditLog.findMany({ where: { organizationId: org.id, recordType: "Expense" } })).map((a) => a.action).sort();
    expect(actions).toEqual(["expense.create", "expense.create", "expense.delete", "expense.update"]);
  });

  it("rejects a zero amount and an unknown category", async () => {
    const { org, order } = await makeOrder();
    await expect(createExpense(org.id, order.id, { category: "FOOD", amount: 0, spentAt: day })).rejects.toThrow(ExpenseError);
    await expect(createExpense(org.id, order.id, { category: "BOGUS" as never, amount: 5, spentAt: day })).rejects.toThrow(ExpenseError);
  });

  it("never lets one kitchen touch another's order or expense", async () => {
    const a = await makeOrder();
    const b = await makeOrder();
    await expect(createExpense(b.org.id, a.order.id, { category: "FOOD", amount: 10, spentAt: day })).rejects.toThrow();
    const exp = await createExpense(a.org.id, a.order.id, { category: "FOOD", amount: 10, spentAt: day });
    await expect(updateExpense(b.org.id, exp.id, { category: "FOOD", amount: 99, spentAt: day })).rejects.toThrow();
    await expect(deleteExpense(b.org.id, exp.id)).rejects.toThrow();
    expect(await listOrderExpenses(b.org.id, a.order.id)).toHaveLength(0);
  });

  it("the Profitability list has one row per order, leaving cancelled ones out", async () => {
    const { org, order } = await makeOrder(8000);
    const second = await makeOrder();
    await createExpense(org.id, order.id, { category: "FOOD", amount: 2000, spentAt: day });
    await prisma.order.update({ where: { id: second.order.id }, data: { status: "CANCELLED" } });
    const rows = await listProfitability(org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ orderId: order.id, revenue: 8000, totalCost: 2000, profit: 6000, expenseCount: 1 });
    expect(await listProfitability(second.org.id)).toHaveLength(0);
  });

  it("records a company expense with no order, kept out of every order's profit", async () => {
    const { org, actor, order } = await makeOrder(10000);
    const rent = await createExpense(org.id, null, { category: "RENT", amount: 25000, spentAt: day, supplierName: "Landlord" }, actor.id);
    expect(rent.orderId).toBeNull();
    expect(await listOrderExpenses(org.id, order.id)).toHaveLength(0);
    expect((await getOrderProfitability(org.id, order.id)).profit).toBe(10000);
    expect((await listProfitability(org.id))[0].totalCost).toBe(0);

    const all = await listExpenses(org.id);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ orderId: null, orderNumber: null, category: "RENT", amount: 25000 });

    await updateExpense(org.id, rent.id, { category: "SALARIES", amount: 30000, spentAt: day }, actor.id);
    expect((await listExpenses(org.id))[0]).toMatchObject({ category: "SALARIES", amount: 30000 });
    await deleteExpense(org.id, rent.id, actor.id);
    expect(await listExpenses(org.id)).toHaveLength(0);
  });

  it("keeps the two kinds of category apart (Miscellaneous fits both)", async () => {
    const { org, order } = await makeOrder();
    await expect(createExpense(org.id, order.id, { category: "RENT", amount: 5, spentAt: day })).rejects.toThrow(ExpenseError);
    await expect(createExpense(org.id, null, { category: "FOOD", amount: 5, spentAt: day })).rejects.toThrow(ExpenseError);
    await expect(createExpense(org.id, null, { category: "MISC", amount: 5, spentAt: day })).resolves.toBeTruthy();
    await expect(createExpense(org.id, order.id, { category: "MISC", amount: 5, spentAt: day })).resolves.toBeTruthy();
  });

  it("the Expenses list is per kitchen and the order options leave cancelled orders out", async () => {
    const a = await makeOrder();
    const b = await makeOrder();
    await createExpense(a.org.id, null, { category: "UTILITIES", amount: 100, spentAt: day });
    await createExpense(a.org.id, a.order.id, { category: "FOOD", amount: 50, spentAt: day });
    expect(await listExpenses(a.org.id)).toHaveLength(2);
    expect(await listExpenses(b.org.id)).toHaveLength(0);
    await prisma.order.update({ where: { id: a.order.id }, data: { status: "CANCELLED" } });
    expect(await listOrderOptions(a.org.id)).toHaveLength(0);
    expect(await listOrderOptions(b.org.id)).toHaveLength(1);
  });

  it("deleting an order removes its expenses", async () => {
    const { org, order } = await makeOrder();
    await createExpense(org.id, order.id, { category: "FOOD", amount: 10, spentAt: day });
    await prisma.order.delete({ where: { id: order.id } });
    expect(await prisma.expense.count({ where: { organizationId: org.id } })).toBe(0);
  });
});
