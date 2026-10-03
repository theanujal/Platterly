import { describe, it, expect, afterEach } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { createOrder } from "@/modules/orders/order";
import { createCustomer } from "@/modules/customers/customer";
import { computeProfitability } from "../profitability";
import { AttachmentError, MAX_ATTACHMENTS_PER_EXPENSE, addExpenseAttachment, removeExpenseAttachment } from "../attachment";
import { createRecurringExpense, deleteRecurringExpense, generateDueRecurringExpenses, listRecurringExpenses, setRecurringExpenseActive, updateRecurringExpense, RecurringExpenseError } from "../recurring";
import { ExpenseError, createExpense, deleteExpense, getOrderProfitability, listExpenses, listOrderExpenses, listOrderOptions, listProfitability, updateExpense } from "../expense";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.expense.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.recurringExpense.deleteMany({ where: { organizationId: { in: orgIds } } });
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

const stored = (key: string) => existsSync(path.join(process.cwd(), "public", "uploads", key));
// A real PDF starts with "%PDF-"; uploads are checked against their content, not just their declared type.
const pdf = (name = "bill.pdf", bytes = 200) => {
  const data = new Uint8Array(bytes);
  data.set(new TextEncoder().encode("%PDF-1.7").subarray(0, bytes));
  return new File([data], name, { type: "application/pdf" });
};

describe("expense attachments", () => {
  it("keeps a receipt with an expense, lists it, and removing it deletes the stored file", async () => {
    const { org, actor, order } = await makeOrder();
    const exp = await createExpense(org.id, order.id, { category: "FOOD", amount: 100, spentAt: day }, actor.id);
    const a = await addExpenseAttachment(org.id, exp.id, pdf("fresh-mart.pdf"), actor.id);
    expect(a).toMatchObject({ fileName: "fresh-mart.pdf", contentType: "application/pdf", sizeBytes: 200 });
    expect(stored(a.key)).toBe(true);
    expect((await listExpenses(org.id))[0].attachments.map((x) => x.fileName)).toEqual(["fresh-mart.pdf"]);
    expect((await listOrderExpenses(org.id, order.id))[0].attachments).toHaveLength(1);
    await removeExpenseAttachment(org.id, a.id, actor.id);
    expect(stored(a.key)).toBe(false);
    expect(await prisma.expenseAttachment.count({ where: { expenseId: exp.id } })).toBe(0);
  });

  it("refuses the wrong type, an oversize or empty file, and a sixth file", async () => {
    const { org, order } = await makeOrder();
    const exp = await createExpense(org.id, order.id, { category: "FOOD", amount: 100, spentAt: day });
    await expect(addExpenseAttachment(org.id, exp.id, new File(["x"], "a.exe", { type: "application/x-msdownload" }))).rejects.toThrow(AttachmentError);
    // A script renamed to look like a PDF is refused: the content is checked, not only the declared type.
    await expect(addExpenseAttachment(org.id, exp.id, new File(["<script>alert(1)</script>"], "bill.pdf", { type: "application/pdf" }))).rejects.toThrow(/not a real/);
    await expect(addExpenseAttachment(org.id, exp.id, pdf("big.pdf", 4 * 1024 * 1024 + 1))).rejects.toThrow(/4MB/);
    await expect(addExpenseAttachment(org.id, exp.id, pdf("empty.pdf", 0))).rejects.toThrow(/empty/);
    for (let i = 0; i < MAX_ATTACHMENTS_PER_EXPENSE; i++) await addExpenseAttachment(org.id, exp.id, pdf(`f${i}.pdf`));
    await expect(addExpenseAttachment(org.id, exp.id, pdf("sixth.pdf"))).rejects.toThrow(/at most/);
  });

  it("deleting the expense, or its order, deletes the stored files too", async () => {
    const { org, actor, order } = await makeOrder();
    const e1 = await createExpense(org.id, order.id, { category: "FOOD", amount: 10, spentAt: day });
    const e2 = await createExpense(org.id, order.id, { category: "LABOUR", amount: 20, spentAt: day });
    const a1 = await addExpenseAttachment(org.id, e1.id, pdf("one.pdf"));
    const a2 = await addExpenseAttachment(org.id, e2.id, pdf("two.pdf"));
    await deleteExpense(org.id, e1.id, actor.id);
    expect(stored(a1.key)).toBe(false);
    expect(stored(a2.key)).toBe(true);
    const { deleteOrder } = await import("@/modules/orders/order");
    await deleteOrder(org.id, order.id, actor.id);
    expect(stored(a2.key)).toBe(false);
  });

  it("never lets one kitchen attach to or remove another's receipt", async () => {
    const a = await makeOrder();
    const b = await makeOrder();
    const exp = await createExpense(a.org.id, a.order.id, { category: "FOOD", amount: 10, spentAt: day });
    await expect(addExpenseAttachment(b.org.id, exp.id, pdf())).rejects.toThrow();
    const att = await addExpenseAttachment(a.org.id, exp.id, pdf());
    await expect(removeExpenseAttachment(b.org.id, att.id)).rejects.toThrow();
    await removeExpenseAttachment(a.org.id, att.id);
  });
});

const input = { category: "RENT" as const, amount: 25000, frequency: "MONTHLY" as const, startDate: new Date("2026-07-01") };

describe("recurring company expenses", () => {
  it("books every date already due, once, and never twice", async () => {
    const { org, actor } = await makeOrder();
    await createRecurringExpense(org.id, { ...input, supplierName: "Landlord" }, actor.id);
    const now = new Date("2026-10-03T10:00:00Z");
    expect(await generateDueRecurringExpenses(org.id, now)).toBe(4);
    const rows = await listExpenses(org.id);
    expect(rows.map((r) => r.spentAt.toISOString().slice(0, 10)).sort()).toEqual(["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(rows.every((r) => r.orderId === null && r.category === "RENT" && r.amount === 25000 && r.supplierName === "Landlord" && r.recurringExpenseId)).toBe(true);
    expect(await generateDueRecurringExpenses(org.id, now)).toBe(0);
    expect(await generateDueRecurringExpenses(org.id, new Date("2026-10-20"))).toBe(0);
    expect(await generateDueRecurringExpenses(org.id, new Date("2026-11-02"))).toBe(1);
    expect(await listExpenses(org.id)).toHaveLength(5);
  });

  it("two runs at once still book each date a single time", async () => {
    const { org, actor } = await makeOrder();
    await createRecurringExpense(org.id, input, actor.id);
    const now = new Date("2026-10-03");
    await Promise.all([generateDueRecurringExpenses(org.id, now), generateDueRecurringExpenses(org.id, now)]);
    expect(await prisma.expense.count({ where: { organizationId: org.id } })).toBe(4);
  });

  it("a future start books nothing yet; an end date stops it", async () => {
    const { org, actor } = await makeOrder();
    await createRecurringExpense(org.id, { ...input, startDate: new Date("2026-12-01") }, actor.id);
    await createRecurringExpense(org.id, { ...input, category: "SALARIES", endDate: new Date("2026-08-15") }, actor.id);
    expect(await generateDueRecurringExpenses(org.id, new Date("2026-10-03"))).toBe(2);
    expect((await listExpenses(org.id)).every((r) => r.category === "SALARIES")).toBe(true);
  });

  it("pausing stops bookings, and resuming skips the dates that fell during the pause", async () => {
    const { org, actor } = await makeOrder();
    const rec = await createRecurringExpense(org.id, input, actor.id);
    await generateDueRecurringExpenses(org.id, new Date("2026-10-03"));
    await setRecurringExpenseActive(org.id, rec.id, false, actor.id);
    expect(await generateDueRecurringExpenses(org.id, new Date("2026-12-15"))).toBe(0);
    await setRecurringExpenseActive(org.id, rec.id, true, actor.id, new Date("2026-12-15"));
    expect(await generateDueRecurringExpenses(org.id, new Date("2026-12-16"))).toBe(0);
    expect(await generateDueRecurringExpenses(org.id, new Date("2027-01-02"))).toBe(1);
    const dates = (await listExpenses(org.id)).map((r) => r.spentAt.toISOString().slice(0, 10)).sort();
    expect(dates).toEqual(["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01", "2027-01-01"]);
  });

  it("editing changes dates not yet booked; deleting the template keeps what it booked", async () => {
    const { org, actor } = await makeOrder();
    const rec = await createRecurringExpense(org.id, input, actor.id);
    await generateDueRecurringExpenses(org.id, new Date("2026-10-03"));
    await updateRecurringExpense(org.id, rec.id, { ...input, amount: 30000 }, actor.id);
    await generateDueRecurringExpenses(org.id, new Date("2026-11-02"));
    const rows = await listExpenses(org.id);
    expect(rows.find((r) => r.spentAt.toISOString().startsWith("2026-10-01"))!.amount).toBe(25000);
    expect(rows.find((r) => r.spentAt.toISOString().startsWith("2026-11-01"))!.amount).toBe(30000);
    await deleteRecurringExpense(org.id, rec.id, actor.id);
    const after = await listExpenses(org.id);
    expect(after).toHaveLength(5);
    expect(after.every((r) => r.recurringExpenseId === null)).toBe(true);
    expect(await listRecurringExpenses(org.id)).toHaveLength(0);
  });

  it("validates: company categories only, a positive amount, an end date after the start", async () => {
    const { org } = await makeOrder();
    await expect(createRecurringExpense(org.id, { ...input, category: "FOOD" })).rejects.toThrow(RecurringExpenseError);
    await expect(createRecurringExpense(org.id, { ...input, amount: 0 })).rejects.toThrow(/greater than zero/);
    await expect(createRecurringExpense(org.id, { ...input, endDate: new Date("2026-06-01") })).rejects.toThrow(/end date/);
    await expect(createRecurringExpense(org.id, { ...input, frequency: "DAILY" as never })).rejects.toThrow(/how often/);
    await expect(createRecurringExpense(org.id, { ...input, startDate: new Date("nope") })).rejects.toThrow(/starts/);
  });

  it("is per kitchen, and shows the next due date", async () => {
    const a = await makeOrder();
    const b = await makeOrder();
    const rec = await createRecurringExpense(a.org.id, input, a.actor.id);
    await expect(updateRecurringExpense(b.org.id, rec.id, input)).rejects.toThrow();
    await expect(setRecurringExpenseActive(b.org.id, rec.id, false)).rejects.toThrow();
    await expect(deleteRecurringExpense(b.org.id, rec.id)).rejects.toThrow();
    expect(await generateDueRecurringExpenses(b.org.id, new Date("2026-10-03"))).toBe(0);
    const [t] = await listRecurringExpenses(a.org.id, new Date("2026-10-03"));
    expect(t.nextDue!.toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(await listRecurringExpenses(b.org.id)).toHaveLength(0);
  });
});

describe("Profitability date range", () => {
  it("filters orders by event date, inclusive of both ends", async () => {
    const { org, actor } = await makeOrder(1000);
    const customer = await prisma.customer.findFirstOrThrow({ where: { organizationId: org.id } });
    const make = (iso: string) =>
      createOrder(org.id, { customerId: customer.id, eventStartDate: new Date(iso), eventEndDate: new Date(iso), totalParticipants: 10, individualPricingEnabled: true, mealPlanEntries: [{ date: new Date(iso), mealType: "DINNER", price: 500 }] }, actor.id);
    await make("2026-11-10");
    await make("2026-11-30");
    await make("2027-01-05");
    const total = (await listProfitability(org.id)).length;
    expect(total).toBe(4);
    const nov = await listProfitability(org.id, { from: new Date("2026-11-01"), to: new Date("2026-11-30") });
    expect(nov.map((r) => r.eventStartDate.toISOString().slice(0, 10)).sort()).toEqual(["2026-11-10", "2026-11-30"]);
    // the order makeOrder() creates is on 5 Dec 2026
    expect(await listProfitability(org.id, { from: new Date("2026-12-01") })).toHaveLength(2);
    expect(await listProfitability(org.id, { to: new Date("2026-11-10") })).toHaveLength(1);
    expect(await listProfitability(org.id, { from: new Date("2030-01-01"), to: new Date("2030-12-31") })).toHaveLength(0);
  });
});
