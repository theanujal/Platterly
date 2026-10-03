import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createCustomer, getCustomer, updateCustomer, updateCustomerNotes, deleteCustomer, getCustomerTimeline, listCustomers } from "@/modules/customers/customer";
import { addCustomerNote, deleteCustomerNote, listCustomerNotes, updateCustomerNote } from "@/modules/customers/customer-notes";
import { createOrder, deleteOrder, getOrder, listOrders, sendOrderWhatsApp, updateOrder, createEventForOrder } from "@/modules/orders/order";
import { createQuotation, deleteQuotation, getOrIssueQuotationLink, getQuotation, listQuotations, sendQuotation, updateQuotation } from "@/modules/quotations/quotation";
import { cancelInvoice, generateInvoiceFromOrder, getInvoice, getInvoiceForCustomer, listInvoices } from "@/modules/invoices/invoice";
import { createPaymentLink, invoiceUrl } from "@/modules/payments/payment-links";
import { confirmPayment, issueReceipt, listOrderPayments, recordPayment, rejectPayment } from "@/modules/payments/payment";
import { createExpense, deleteExpense, getOrderProfitability, listExpenses, updateExpense } from "@/modules/expenses/expense";
import { createRecurringExpense, deleteRecurringExpense, setRecurringExpenseActive, updateRecurringExpense } from "@/modules/expenses/recurring";
import { createAddOn, deleteAddOn, duplicateAddOn, getAddOn, listAddOns, setAddOnActive, updateAddOn } from "@/modules/addons/addon";
import { createInventoryItem, deleteInventoryItem, getInventoryItem, listInventoryItems, recordStockTransaction, updateInventoryItem } from "@/modules/inventory/inventory";
import { createEventType, deleteEventType, duplicateEventType, getEventType, listEventTypes, setEventTypeActive, updateEventType } from "@/modules/events/event-type";
import { deleteEvent, getEvent, listEvents } from "@/modules/events/event";
import { createMenuItem, deleteMenuItem, duplicateMenuItem, getMenuItem, listMenuItems, setMenuItemActive, updateMenuItem } from "@/modules/menus/item";
import { createCategory, deleteCategory, duplicateCategory, getCategory, listCategories, setCategoryActive, updateCategory } from "@/modules/menus/category";
import { createMenu, deleteMenu, duplicateMenu, getMenu, listMenus, setMenuActive, updateMenu } from "@/modules/menus/menu";
import { createMenuSelection, getMenuSelection, getKitchenPrepSheet, listMenuApprovalNotes, sendToCustomer } from "@/modules/menu-approvals/menu-approval";
import { disableMember, enableMember, listMembers } from "@/modules/team/team";
import { getInbox, markAllRead } from "@/modules/notifications/inbox";
import { notify } from "@/lib/notifications/notify";
import { listAuditLog } from "@/modules/audit/audit-log";
import { purgeTenantData } from "@/lib/tenant-purge/purge";
import { TENANT_SCOPED_DELEGATES } from "@/lib/tenant-purge/tenant-scoped-models";

/**
 * Chunk 17.3 — tenant-isolation regression suite. Kitchen A owns one of everything; kitchen B (a signed-in, valid
 * member of its own kitchen) is handed A's ids and tries to read, change and delete them through every module
 * function that takes an id. Each attempt must be refused (throw) or find nothing (null / empty); a list must never
 * contain A's rows; and at the end every A record is exactly as it was.
 */

type Ids = Record<string, string>;
const A: Ids = {};
let orgA = "";
let orgB = "";
let actorA = "";
let actorB = "";
let unreadBaseline = 0;
const orgIds: string[] = [];
const userIds: string[] = [];

async function makeOrg(label: string) {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: `Iso ${label}`, slug: `iso-${label}-${crypto.randomUUID().slice(0, 6)}`, createdAt: new Date() } });
  const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: label, email: `iso-${label}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  const member = await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: user.id, role: "owner", createdAt: new Date() } });
  orgIds.push(org.id);
  userIds.push(user.id);
  return { org, user, member };
}

const day = new Date("2027-02-10");

beforeAll(async () => {
  const a = await makeOrg("a");
  const b = await makeOrg("b");
  [orgA, orgB, actorA, actorB] = [a.org.id, b.org.id, a.user.id, b.user.id];
  A.member = a.member.id;

  const customer = await createCustomer(orgA, { name: "Asha Rao", phone: "9876500001", email: "asha@example.test" }, actorA);
  A.customer = customer.id;
  A.note = (await addCustomerNote(orgA, customer.id, "A private note", { userId: actorA, name: "A" })).id;
  A.eventType = (await createEventType(orgA, { name: "Wedding", minGuests: 10 }, actorA)).id;
  A.addOn = (await createAddOn(orgA, { name: "Chaat Counter", type: "LIVE_COUNTER", priceType: "PER_PLATE", price: 100 }, actorA)).id;
  A.inventory = (await createInventoryItem(orgA, { name: "Rice", category: "Grains", unit: "kg" }, actorA, 20)).id;
  A.menuItem = (await createMenuItem(orgA, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 250 }, actorA)).id;
  A.category = (await createCategory(orgA, { name: "Starters" }, actorA)).id;
  A.menu = (await createMenu(orgA, { name: "Veg Menu", menuType: "VEGETARIAN", pricePerPlate: 350 }, actorA)).id;
  const order = await createOrder(orgA, { customerId: customer.id, eventTypeId: A.eventType, eventStartDate: day, eventEndDate: day, totalParticipants: 50, individualPricingEnabled: true, mealPlanEntries: [{ date: day, mealType: "DINNER", price: 400 }] }, actorA);
  A.order = order.id;
  A.event = (await createEventForOrder(orgA, order.id, actorA)).id;
  A.selection = (await createMenuSelection(orgA, A.event)).id;
  A.quotation = (await createQuotation(orgA, { customerId: customer.id, eventStartDate: day, eventEndDate: day, totalParticipants: 50, individualPricingEnabled: true, mealPlanEntries: [{ date: day, mealType: "DINNER", price: 400 }] }, actorA)).id;
  A.expense = (await createExpense(orgA, order.id, { category: "FOOD", amount: 1000, spentAt: day }, actorA)).id;
  A.recurring = (await createRecurringExpense(orgA, { category: "RENT", amount: 5000, frequency: "MONTHLY", startDate: day }, actorA)).id;
  A.payment = (await recordPayment({ organizationId: orgA, orderId: order.id, amount: 100, type: "ADVANCE", method: "UPI", source: "UPI_QR", status: "PENDING", actorUserId: actorA })).id;
  A.invoice = (await generateInvoiceFromOrder(orgA, order.id)).id;
  await notify({ organizationId: orgA, channel: "IN_APP", event: "order.new_alert", recipient: { userId: actorA }, payload: { title: "Private", message: "A only" } });
  unreadBaseline = (await getInbox(orgA, actorA)).unread;
}, 120_000);

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}, 60_000);

/** True when B got nothing useful: the call threw, or returned null / undefined / an empty list. */
async function refused(call: () => Promise<unknown>): Promise<boolean> {
  try {
    const result = await call();
    return result === null || result === undefined || (Array.isArray(result) && result.length === 0);
  } catch {
    return true;
  }
}

const idsIn = (rows: unknown): string[] => (Array.isArray(rows) ? rows.map((r) => (r as { id?: string }).id ?? "") : []);
const input = { customerId: "x", eventStartDate: day } as never;

describe("tenant isolation: kitchen B cannot reach kitchen A's records by id", () => {
  const attacks: Array<[string, () => Promise<unknown>]> = [
    ["getCustomer", () => getCustomer(orgB, A.customer)],
    ["updateCustomer", () => updateCustomer(orgB, A.customer, { name: "HACKED", phone: "9000000009" }, actorB)],
    ["updateCustomerNotes", () => updateCustomerNotes(orgB, A.customer, "HACKED", actorB)],
    ["deleteCustomer", () => deleteCustomer(orgB, A.customer, actorB)],
    ["getCustomerTimeline", () => getCustomerTimeline(orgB, A.customer)],
    ["listCustomerNotes", () => listCustomerNotes(orgB, A.customer)],
    ["addCustomerNote", () => addCustomerNote(orgB, A.customer, "HACKED", { name: "B" })],
    ["updateCustomerNote", () => updateCustomerNote(orgB, A.note, "HACKED", actorB)],
    ["deleteCustomerNote", () => deleteCustomerNote(orgB, A.note, actorB)],
    ["getOrder", () => getOrder(orgB, A.order)],
    ["updateOrder", () => updateOrder(orgB, A.order, { customerId: A.customer, eventStartDate: new Date("2030-01-01") } as never, actorB)],
    ["deleteOrder", () => deleteOrder(orgB, A.order, actorB)],
    ["sendOrderWhatsApp", () => sendOrderWhatsApp(orgB, A.order, actorB)],
    ["createEventForOrder", () => createEventForOrder(orgB, A.order, actorB)],
    ["getQuotation", () => getQuotation(orgB, A.quotation)],
    ["updateQuotation", () => updateQuotation(orgB, A.quotation, input, actorB)],
    ["deleteQuotation", () => deleteQuotation(orgB, A.quotation, actorB)],
    ["sendQuotation", () => sendQuotation(orgB, A.quotation, actorB)],
    ["getOrIssueQuotationLink", () => getOrIssueQuotationLink(orgB, A.quotation)],
    ["invoiceUrl (public link)", () => invoiceUrl(orgB, A.invoice)],
    ["createPaymentLink on A's order", () => createPaymentLink({ organizationId: orgB, orderId: A.order, kind: "BALANCE" })],
    ["getInvoice", () => getInvoice(orgB, A.invoice)],
    ["getInvoiceForCustomer", () => getInvoiceForCustomer(orgB, A.invoice)],
    ["cancelInvoice", () => cancelInvoice(orgB, A.invoice, actorB)],
    ["generateInvoiceFromOrder", () => generateInvoiceFromOrder(orgB, A.order)],
    ["confirmPayment", () => confirmPayment(orgB, A.payment, actorB)],
    ["rejectPayment", () => rejectPayment(orgB, A.payment, actorB)],
    ["issueReceipt", () => issueReceipt(orgB, A.payment)],
    ["listOrderPayments", () => listOrderPayments(orgB, A.order)],
    ["recordPayment on A's order", () => recordPayment({ organizationId: orgB, orderId: A.order, amount: 10, type: "PARTIAL", method: "CASH", actorUserId: actorB })],
    ["createExpense on A's order", () => createExpense(orgB, A.order, { category: "FOOD", amount: 5, spentAt: day }, actorB)],
    ["updateExpense", () => updateExpense(orgB, A.expense, { category: "FOOD", amount: 1, spentAt: day }, actorB)],
    ["deleteExpense", () => deleteExpense(orgB, A.expense, actorB)],
    ["getOrderProfitability", () => getOrderProfitability(orgB, A.order)],
    ["updateRecurringExpense", () => updateRecurringExpense(orgB, A.recurring, { category: "RENT", amount: 1, frequency: "MONTHLY", startDate: day }, actorB)],
    ["setRecurringExpenseActive", () => setRecurringExpenseActive(orgB, A.recurring, false, actorB)],
    ["deleteRecurringExpense", () => deleteRecurringExpense(orgB, A.recurring, actorB)],
    ["getAddOn", () => getAddOn(orgB, A.addOn)],
    ["updateAddOn", () => updateAddOn(orgB, A.addOn, { name: "HACKED", type: "LIVE_COUNTER", priceType: "FIXED", price: 1 }, actorB)],
    ["deleteAddOn", () => deleteAddOn(orgB, A.addOn, actorB)],
    ["duplicateAddOn", () => duplicateAddOn(orgB, A.addOn, actorB)],
    ["setAddOnActive", () => setAddOnActive(orgB, A.addOn, false, actorB)],
    ["getInventoryItem", () => getInventoryItem(orgB, A.inventory)],
    ["updateInventoryItem", () => updateInventoryItem(orgB, A.inventory, { name: "HACKED", category: "Grains", unit: "kg" }, actorB)],
    ["deleteInventoryItem", () => deleteInventoryItem(orgB, A.inventory, actorB)],
    ["recordStockTransaction", () => recordStockTransaction(orgB, A.inventory, { type: "OUT", quantity: 5 } as never, actorB)],
    ["getEventType", () => getEventType(orgB, A.eventType)],
    ["updateEventType", () => updateEventType(orgB, A.eventType, { name: "HACKED" } as never, actorB)],
    ["deleteEventType", () => deleteEventType(orgB, A.eventType, actorB)],
    ["duplicateEventType", () => duplicateEventType(orgB, A.eventType, actorB)],
    ["setEventTypeActive", () => setEventTypeActive(orgB, A.eventType, false, actorB)],
    ["getEvent", () => getEvent(orgB, A.event)],
    ["deleteEvent", () => deleteEvent(orgB, A.event, actorB)],
    ["getMenuItem", () => getMenuItem(orgB, A.menuItem)],
    ["updateMenuItem", () => updateMenuItem(orgB, A.menuItem, { name: "HACKED", foodType: "VEGETARIAN", price: 1 }, actorB)],
    ["deleteMenuItem", () => deleteMenuItem(orgB, A.menuItem, actorB)],
    ["duplicateMenuItem", () => duplicateMenuItem(orgB, A.menuItem, actorB)],
    ["setMenuItemActive", () => setMenuItemActive(orgB, A.menuItem, false, actorB)],
    ["getCategory", () => getCategory(orgB, A.category)],
    ["updateCategory", () => updateCategory(orgB, A.category, { name: "HACKED" }, actorB)],
    ["deleteCategory", () => deleteCategory(orgB, A.category, actorB)],
    ["duplicateCategory", () => duplicateCategory(orgB, A.category, actorB)],
    ["setCategoryActive", () => setCategoryActive(orgB, A.category, false, actorB)],
    ["getMenu", () => getMenu(orgB, A.menu)],
    ["updateMenu", () => updateMenu(orgB, A.menu, { name: "HACKED", menuType: "VEGETARIAN", pricePerPlate: 1 }, actorB)],
    ["deleteMenu", () => deleteMenu(orgB, A.menu, actorB)],
    ["duplicateMenu", () => duplicateMenu(orgB, A.menu, actorB)],
    ["setMenuActive", () => setMenuActive(orgB, A.menu, false, actorB)],
    ["getMenuSelection", () => getMenuSelection(orgB, A.selection)],
    ["getKitchenPrepSheet", () => getKitchenPrepSheet(orgB, A.selection)],
    ["listMenuApprovalNotes", () => listMenuApprovalNotes(orgB, A.selection)],
    ["sendToCustomer", () => sendToCustomer(orgB, A.selection, actorB)],
    ["disableMember", () => disableMember(orgB, A.member, actorB)],
    ["enableMember", () => enableMember(orgB, A.member, actorB)],
    ["getInbox of A's user", () => getInbox(orgB, actorA).then((i) => i.items)],
  ];

  it.each(attacks)("%s is refused or finds nothing", async (_name, call) => {
    expect(await refused(call)).toBe(true);
  });

  it("no list for kitchen B contains any of kitchen A's rows", async () => {
    const lists: Array<[string, Promise<unknown>, string]> = [
      ["customers", listCustomers(orgB), A.customer],
      ["orders", listOrders(orgB), A.order],
      ["quotations", listQuotations(orgB), A.quotation],
      ["invoices", listInvoices(orgB), A.invoice],
      ["expenses", listExpenses(orgB), A.expense],
      ["add-ons", listAddOns(orgB), A.addOn],
      ["inventory", listInventoryItems(orgB), A.inventory],
      ["event types", listEventTypes(orgB), A.eventType],
      ["events", listEvents(orgB), A.event],
      ["menu items", listMenuItems(orgB), A.menuItem],
      ["categories", listCategories(orgB), A.category],
      ["menus", listMenus(orgB), A.menu],
      ["members", listMembers(orgB), A.member],
    ];
    for (const [name, rows, aId] of lists) {
      const ids = idsIn(await rows);
      expect(ids, `${name} leaked kitchen A's row`).not.toContain(aId);
    }
    // The Audit Log shows each kitchen only its own history.
    const bLog = await listAuditLog(orgB);
    expect(bLog.entries.every((e) => ![A.order, A.customer, A.expense, A.invoice].includes(e.recordId))).toBe(true);
    expect(bLog.total).toBe(0);
    expect((await listAuditLog(orgA)).total).toBeGreaterThan(5);
    expect((await getInbox(orgB, actorB)).items).toHaveLength(0);
    await markAllRead(orgB, actorA); // B acting on A's user id inside B's own kitchen touches nothing
    expect((await getInbox(orgA, actorA)).unread).toBe(unreadBaseline);
  });

  it("after every attack, kitchen A's data is exactly as it was", async () => {
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: A.customer } })).name).toBe("Asha Rao");
    expect((await prisma.customerNote.findUniqueOrThrow({ where: { id: A.note } })).body).toBe("A private note");
    expect(Number((await prisma.order.findUniqueOrThrow({ where: { id: A.order } })).total)).toBe(400);
    expect(await prisma.quotation.findUniqueOrThrow({ where: { id: A.quotation } })).toMatchObject({ status: "DRAFT" });
    const expense = await prisma.expense.findUniqueOrThrow({ where: { id: A.expense } });
    expect(Number(expense.amount)).toBe(1000);
    expect((await prisma.recurringExpense.findUniqueOrThrow({ where: { id: A.recurring } })).isActive).toBe(true);
    expect((await prisma.addOn.findUniqueOrThrow({ where: { id: A.addOn } })).name).toBe("Chaat Counter");
    expect(await prisma.addOn.count({ where: { organizationId: orgB } })).toBe(0);
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { id: A.inventory } })).stockCount)).toBe(20);
    expect((await prisma.eventType.findUniqueOrThrow({ where: { id: A.eventType } })).name).toBe("Wedding");
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: A.menuItem } })).name).toBe("Paneer Tikka");
    expect((await prisma.menuCategory.findUniqueOrThrow({ where: { id: A.category } })).name).toBe("Starters");
    expect((await prisma.menu.findUniqueOrThrow({ where: { id: A.menu } })).name).toBe("Veg Menu");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: A.payment } })).status).toBe("PENDING");
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: A.invoice } })).status).not.toBe("CANCELLED");
    expect((await prisma.member.findUniqueOrThrow({ where: { id: A.member } })).disabledAt).toBeNull();
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: A.selection } })).status).toBe("DRAFT");
    // And kitchen B ended up with nothing of A's attached to it.
    for (const table of ["order", "customer", "quotation", "expense", "invoice", "payment", "menuSelection"] as const) {
      expect(await (prisma[table] as unknown as { count: (a: unknown) => Promise<number> }).count({ where: { organizationId: orgB } }), `${table} rows appeared in kitchen B`).toBe(0);
    }
  });

  it("purging kitchen A (Danger Zone) removes every one of A's rows, leaves kitchen B alone and keeps the audit trail", async () => {
    await createCustomer(orgB, { name: "Bee Customer", phone: "9876500777" }, actorB); // something of B's that must survive
    await purgeTenantData(orgA, actorA, "DELETE");

    for (const delegate of TENANT_SCOPED_DELEGATES) {
      const remaining = await (prisma as unknown as Record<string, { count: (a: unknown) => Promise<number> }>)[delegate].count({ where: { organizationId: orgA } });
      expect(remaining, `${delegate} rows left after the purge`).toBe(0);
    }
    expect(await prisma.customer.count({ where: { organizationId: orgB } })).toBe(1);
    expect(await prisma.organization.count({ where: { id: orgA } })).toBe(1); // the kitchen itself and its team stay
    expect(await prisma.member.count({ where: { organizationId: orgA } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { organizationId: orgA, action: "tenant.data_purge" } })).toBe(1);
    // Children that have no organizationId of their own are gone too (no orphans).
    expect(await prisma.mealPlanEntry.count({ where: { orderId: A.order } })).toBe(0);
    expect(await prisma.invoiceItem.count({ where: { invoiceId: A.invoice } })).toBe(0);
    expect(await prisma.menuVersion.count({ where: { menuSelectionId: A.selection } })).toBe(0);
  });
});
