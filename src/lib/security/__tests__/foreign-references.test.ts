import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder, updateOrder } from "@/modules/orders/order";
import { createEvent, updateEvent } from "@/modules/events/event";
import { createQuotation, updateQuotation } from "@/modules/quotations/quotation";
import { recordPayment } from "@/modules/payments/payment";
import { createPaymentLink } from "@/modules/payments/payment-links";

/**
 * Chunk 25 security audit (P1). The tenant-isolation suite hands kitchen B kitchen A's id as the thing to act on. This
 * one covers the other way in: B's own record pointing at A's id inside the request body (a customer, event type,
 * location or invoice). Each must be refused, and nothing of A's may end up linked to B.
 */
const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.payment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = userIds.length = 0;
});

async function kitchen(label: string) {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: `Refs ${label}`, slug: `refs-${label}-${crypto.randomUUID().slice(0, 6)}`, status: "ACTIVE", createdAt: new Date() } });
  orgIds.push(org.id);
  const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: label, email: `${label}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(user.id);
  const customer = await prisma.customer.create({ data: { organizationId: org.id, name: `${label} customer`, phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}` } });
  const eventType = await prisma.eventType.create({ data: { organizationId: org.id, name: `${label} type` } });
  const branch = await prisma.branch.create({ data: { organizationId: org.id, name: "Main", isDefault: true } });
  const location = await prisma.kitchen.create({ data: { organizationId: org.id, branchId: branch.id, name: `${label} location`, isDefault: true } });
  return { org, user, customer, eventType, location };
}

const day = new Date("2030-06-01");
const order = (organizationId: string, customerId: string, eventTypeId: string) =>
  prisma.order.create({ data: { organizationId, customerId, eventTypeId, eventStartDate: day, eventEndDate: day, total: 1000, balance: 1000 } });

describe("records may only point at records of their own kitchen", () => {
  it("an order cannot be created for, or moved to, another kitchen's customer or event type", async () => {
    const [a, b] = [await kitchen("a"), await kitchen("b")];
    const base = { eventStartDate: day, eventEndDate: day };
    await expect(createOrder(b.org.id, { ...base, customerId: a.customer.id, eventTypeId: b.eventType.id }, b.user.id)).rejects.toThrow(/customer/);
    await expect(createOrder(b.org.id, { ...base, customerId: b.customer.id, eventTypeId: a.eventType.id }, b.user.id)).rejects.toThrow(/event type/);
    const mine = await createOrder(b.org.id, { ...base, customerId: b.customer.id, eventTypeId: b.eventType.id }, b.user.id);
    await expect(updateOrder(b.org.id, mine.id, { ...base, customerId: a.customer.id }, b.user.id)).rejects.toThrow(/customer/);
    await expect(updateOrder(b.org.id, mine.id, { ...base, customerId: b.customer.id, eventTypeId: a.eventType.id }, b.user.id)).rejects.toThrow(/event type/);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: mine.id } })).customerId).toBe(b.customer.id);
    expect(await prisma.order.count({ where: { customerId: a.customer.id } })).toBe(0);
  });

  it("an event cannot point at another kitchen's customer, event type or location", async () => {
    const [a, b] = [await kitchen("a"), await kitchen("b")];
    const input = { name: "E", startDate: day, endDate: day, customerId: b.customer.id, eventTypeId: b.eventType.id };
    await expect(createEvent(b.org.id, { ...input, customerId: a.customer.id }, b.user.id)).rejects.toThrow(/customer/);
    await expect(createEvent(b.org.id, { ...input, eventTypeId: a.eventType.id }, b.user.id)).rejects.toThrow(/event type/);
    await expect(createEvent(b.org.id, { ...input, assignedKitchenId: a.location.id }, b.user.id)).rejects.toThrow(/location/);
    const mine = await createEvent(b.org.id, { ...input, assignedKitchenId: b.location.id }, b.user.id);
    await expect(updateEvent(b.org.id, mine.id, { ...input, customerId: a.customer.id }, b.user.id)).rejects.toThrow(/customer/);
    await expect(updateEvent(b.org.id, mine.id, { ...input, assignedKitchenId: a.location.id }, b.user.id)).rejects.toThrow(/location/);
  });

  it("a quotation cannot point at another kitchen's customer or event type", async () => {
    const [a, b] = [await kitchen("a"), await kitchen("b")];
    const base = { eventStartDate: day, eventEndDate: day };
    await expect(createQuotation(b.org.id, { ...base, customerId: a.customer.id }, b.user.id)).rejects.toThrow(/customer/);
    const mine = await createQuotation(b.org.id, { ...base, customerId: b.customer.id }, b.user.id);
    await expect(updateQuotation(b.org.id, mine.id, { ...base, customerId: b.customer.id, eventTypeId: a.eventType.id }, b.user.id)).rejects.toThrow(/event type/);
  });

  it("a payment or payment link cannot be filed under another kitchen's invoice, or another order's", async () => {
    const [a, b] = [await kitchen("a"), await kitchen("b")];
    const aOrder = await order(a.org.id, a.customer.id, a.eventType.id);
    const bOrder = await order(b.org.id, b.customer.id, b.eventType.id);
    const otherBOrder = await order(b.org.id, b.customer.id, b.eventType.id);
    const invoice = (organizationId: string, orderId: string, number: string) => prisma.invoice.create({ data: { organizationId, orderId, number, customerName: "x", businessName: "y" } });
    const aInvoice = await invoice(a.org.id, aOrder.id, "INV-A");
    const bInvoice = await invoice(b.org.id, bOrder.id, "INV-B");
    const pay = (invoiceId: string | null) => recordPayment({ organizationId: b.org.id, orderId: bOrder.id, invoiceId, amount: 100, type: "ADVANCE", method: "CASH", actorUserId: b.user.id });
    await expect(pay(aInvoice.id)).rejects.toThrow(/invoice/);
    await expect(recordPayment({ organizationId: b.org.id, orderId: otherBOrder.id, invoiceId: bInvoice.id, amount: 100, type: "ADVANCE", method: "CASH", actorUserId: b.user.id })).rejects.toThrow(/invoice/);
    await expect(createPaymentLink({ organizationId: b.org.id, orderId: bOrder.id, kind: "CUSTOM", amount: 100, invoiceId: aInvoice.id })).rejects.toThrow(/invoice/);
    await expect(pay(bInvoice.id)).resolves.toBeTruthy();
    expect(await prisma.payment.count({ where: { invoiceId: aInvoice.id } })).toBe(0);
  });
});
