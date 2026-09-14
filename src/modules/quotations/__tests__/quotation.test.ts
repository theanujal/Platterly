import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createQuotation,
  updateQuotation,
  deleteQuotation,
  listQuotations,
  getQuotation,
  recalculateQuotationTotals,
  sendQuotation,
  getOrIssueQuotationLink,
  markQuotationExpired,
  resolveQuotationToken,
  markQuotationViewed,
  acceptQuotation,
  rejectQuotation,
  requestQuotationChanges,
  convertQuotationToOrder,
  isQuotationPastValidity,
  InvalidQuotationTransitionError,
  QuotationEventDatesRequiredError,
} from "@/modules/quotations/quotation";
import { createCustomer } from "@/modules/customers/customer";
import { createEventType } from "@/modules/events/event-type";
import { createMenuItem } from "@/modules/menus/item";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.quotation.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.secureAccessToken.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.eventType.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menuItem.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Quotation Test Org", slug: `quote-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
  });
  cleanupOrgIds.push(org.id);
  return org;
}

async function makeActor() {
  const actor = await prisma.user.create({
    data: { id: crypto.randomUUID(), name: "Owner", email: `owner-${crypto.randomUUID()}@example.test`, emailVerified: true },
  });
  cleanupUserIds.push(actor.id);
  return actor;
}

async function makeCustomer(orgId: string, actorUserId: string) {
  return createCustomer(orgId, { name: "Asha Rao", phone: "9876543210" }, actorUserId);
}

describe("Quotation CRUD (Chunk 10 Group 10.1)", () => {
  it("createQuotation defaults status to DRAFT and computes totals from items", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menuItem = await createMenuItem(org.id, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 150 }, actor.id);

    const quotation = await createQuotation(
      org.id,
      { customerId: customer.id, discount: 50, taxes: 20, additionalCharges: 10, deliveryCharges: 5, items: [{ itemType: "MENU_ITEM", catalogId: menuItem.id, quantity: 4 }] },
      actor.id,
    );

    expect(quotation.status).toBe("DRAFT");
    expect(Number(quotation.subtotal)).toBe(600);
    expect(Number(quotation.total)).toBe(600 - 50 + 20 + 10 + 5);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "quotation.create", recordId: quotation.id } });
    expect(log).not.toBeNull();
  });

  it("updateQuotation replaces items and recalculates totals", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const cheap = await createMenuItem(org.id, { name: "Salad", foodType: "VEGETARIAN", price: 50 }, actor.id);
    const pricier = await createMenuItem(org.id, { name: "Biryani", foodType: "NON_VEGETARIAN", price: 300 }, actor.id);
    const quotation = await createQuotation(org.id, { customerId: customer.id, items: [{ itemType: "MENU_ITEM", catalogId: cheap.id, quantity: 1 }] }, actor.id);

    const updated = await updateQuotation(org.id, quotation.id, { customerId: customer.id, items: [{ itemType: "MENU_ITEM", catalogId: pricier.id, quantity: 2 }] }, actor.id);
    expect(Number(updated.subtotal)).toBe(600);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "quotation.update", recordId: quotation.id } });
    expect(log).not.toBeNull();
  });

  it("deleteQuotation hard-deletes and cascades items", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menuItem = await createMenuItem(org.id, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 150 }, actor.id);
    const quotation = await createQuotation(org.id, { customerId: customer.id, items: [{ itemType: "MENU_ITEM", catalogId: menuItem.id, quantity: 1 }] }, actor.id);

    await deleteQuotation(org.id, quotation.id, actor.id);

    expect(await getQuotation(org.id, quotation.id)).toBeNull();
    expect(await prisma.quotationItem.count({ where: { quotationId: quotation.id } })).toBe(0);
  });

  it("listQuotations filters by status and is tenant-isolated", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const draft = await createQuotation(org.id, { customerId: customer.id }, actor.id);
    const { quotation: sent } = await sendQuotation(org.id, (await createQuotation(org.id, { customerId: customer.id }, actor.id)).id, actor.id);

    expect((await listQuotations(org.id, { status: "SENT" })).map((q) => q.id)).toEqual([sent.id]);
    expect((await listQuotations(org.id)).map((q) => q.id).sort()).toEqual([draft.id, sent.id].sort());
  });

  it("recalculateQuotationTotals is idempotent when called directly", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const quotation = await createQuotation(org.id, { customerId: customer.id, taxes: 30 }, actor.id);

    const recalculated = await recalculateQuotationTotals(quotation.id);
    expect(Number(recalculated.total)).toBe(30);
  });
});

describe("sendQuotation / getOrIssueQuotationLink (PRD §20's Draft -> Sent)", () => {
  it("moves DRAFT to SENT and issues a resolvable public link", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const quotation = await createQuotation(org.id, { customerId: customer.id }, actor.id);

    const { quotation: sent, url } = await sendQuotation(org.id, quotation.id, actor.id);
    expect(sent.status).toBe("SENT");
    expect(url).toContain("/quote/");

    const token = url.split("/quote/")[1];
    const resolved = await resolveQuotationToken(token);
    expect(resolved).toEqual({ organizationId: org.id, quotationId: quotation.id });
  });

  it("getOrIssueQuotationLink reuses a live token instead of minting a new one each call", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const quotation = await createQuotation(org.id, { customerId: customer.id }, actor.id);
    const { url: sentUrl } = await sendQuotation(org.id, quotation.id, actor.id);

    const again = await getOrIssueQuotationLink(org.id, quotation.id);
    expect(again).toBe(sentUrl);
    expect(await prisma.secureAccessToken.count({ where: { organizationId: org.id, resourceType: "QUOTATION" } })).toBe(1);
  });

  it("rejects sending a Quotation that's already SENT/ACCEPTED/etc.", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const quotation = await createQuotation(org.id, { customerId: customer.id }, actor.id);
    await sendQuotation(org.id, quotation.id, actor.id);

    await expect(sendQuotation(org.id, quotation.id, actor.id)).rejects.toThrow(InvalidQuotationTransitionError);
  });

  it("is sendable again from CHANGES_REQUESTED", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const quotation = await createQuotation(org.id, { customerId: customer.id }, actor.id);
    const { url } = await sendQuotation(org.id, quotation.id, actor.id);
    const token = url.split("/quote/")[1];
    const resolved = await resolveQuotationToken(token);
    await requestQuotationChanges(resolved!.organizationId, resolved!.quotationId, "Please add dessert");

    const { quotation: resent } = await sendQuotation(org.id, quotation.id, actor.id);
    expect(resent.status).toBe("SENT");
  });
});

describe("markQuotationExpired (admin escalation)", () => {
  it("moves a non-terminal Quotation to EXPIRED", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const quotation = await createQuotation(org.id, { customerId: customer.id }, actor.id);

    const expired = await markQuotationExpired(org.id, quotation.id, actor.id);
    expect(expired.status).toBe("EXPIRED");
  });

  it("rejects expiring an already-ACCEPTED/REJECTED/EXPIRED Quotation", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const quotation = await createQuotation(org.id, { customerId: customer.id }, actor.id);
    await markQuotationExpired(org.id, quotation.id, actor.id);

    await expect(markQuotationExpired(org.id, quotation.id, actor.id)).rejects.toThrow(InvalidQuotationTransitionError);
  });
});

describe("isQuotationPastValidity", () => {
  it("returns false for null, true for a past date, false for a future date", () => {
    expect(isQuotationPastValidity(null)).toBe(false);
    expect(isQuotationPastValidity(new Date("2000-01-01"))).toBe(true);
    expect(isQuotationPastValidity(new Date("2099-01-01"))).toBe(false);
  });
});

describe("Customer token actions — accept/reject/request changes (PRD §20 digital approval)", () => {
  async function sendAndResolve(orgId: string, actorId: string, customerId: string) {
    const quotation = await createQuotation(orgId, { customerId }, actorId);
    const { url } = await sendQuotation(orgId, quotation.id, actorId);
    const token = url.split("/quote/")[1];
    const resolved = (await resolveQuotationToken(token))!;
    return { quotation, resolved };
  }

  it("markQuotationViewed moves SENT to VIEWED and is a no-op afterward", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const { resolved } = await sendAndResolve(org.id, actor.id, customer.id);

    const viewed = await markQuotationViewed(resolved.organizationId, resolved.quotationId);
    expect(viewed.status).toBe("VIEWED");

    const again = await markQuotationViewed(resolved.organizationId, resolved.quotationId);
    expect(again.status).toBe("VIEWED");
  });

  it("acceptQuotation moves SENT/VIEWED to ACCEPTED, with no actorUserId on the AuditLog", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const { quotation, resolved } = await sendAndResolve(org.id, actor.id, customer.id);

    const accepted = await acceptQuotation(resolved.organizationId, resolved.quotationId);
    expect(accepted.status).toBe("ACCEPTED");

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "quotation.accept", recordId: quotation.id } });
    expect(log).not.toBeNull();
    expect(log!.actorUserId).toBeNull();
  });

  it("rejectQuotation stores the customer's own message", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const { resolved } = await sendAndResolve(org.id, actor.id, customer.id);

    const rejected = await rejectQuotation(resolved.organizationId, resolved.quotationId, "Too expensive");
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.customerMessage).toBe("Too expensive");
  });

  it("requestQuotationChanges moves to CHANGES_REQUESTED with a message", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const { resolved } = await sendAndResolve(org.id, actor.id, customer.id);

    const requested = await requestQuotationChanges(resolved.organizationId, resolved.quotationId, "Add a dessert course");
    expect(requested.status).toBe("CHANGES_REQUESTED");
    expect(requested.customerMessage).toBe("Add a dessert course");
  });

  it("rejects a customer action once the Quotation is no longer SENT/VIEWED", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const { resolved } = await sendAndResolve(org.id, actor.id, customer.id);
    await acceptQuotation(resolved.organizationId, resolved.quotationId);

    await expect(acceptQuotation(resolved.organizationId, resolved.quotationId)).rejects.toThrow(InvalidQuotationTransitionError);
  });

  it("resolveQuotationToken returns null for a bogus token", async () => {
    expect(await resolveQuotationToken("not-a-real-token")).toBeNull();
  });
});

describe("convertQuotationToOrder (Group 10.2's 'generated from an Accepted Quotation')", () => {
  it("creates a real Order with the Quotation's snapshot items and folds additional+delivery charges into taxes", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const menuItem = await createMenuItem(org.id, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 150 }, actor.id);

    const quotation = await createQuotation(
      org.id,
      {
        customerId: customer.id,
        eventTypeId: eventType.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-02"),
        venue: "Taj Hall",
        discount: 50,
        taxes: 20,
        additionalCharges: 10,
        deliveryCharges: 5,
        items: [{ itemType: "MENU_ITEM", catalogId: menuItem.id, quantity: 4 }],
      },
      actor.id,
    );
    const { url } = await sendQuotation(org.id, quotation.id, actor.id);
    const token = url.split("/quote/")[1];
    const resolved = (await resolveQuotationToken(token))!;
    await acceptQuotation(resolved.organizationId, resolved.quotationId);

    const order = await convertQuotationToOrder(org.id, quotation.id, actor.id);

    expect(order.customerId).toBe(customer.id);
    expect(order.eventTypeId).toBe(eventType.id);
    expect(order.quotationId).toBe(quotation.id);
    expect(Number(order.subtotal)).toBe(600); // 150 * 4, copied from the frozen QuotationItem snapshot
    // taxes = quotation.taxes + additionalCharges + deliveryCharges = 20 + 10 + 5 = 35
    expect(Number(order.taxes)).toBe(35);
    expect(Number(order.total)).toBe(600 - 50 + 35);

    const orderItems = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    expect(orderItems).toHaveLength(1);
    expect(orderItems[0].name).toBe("Paneer Tikka");
    expect(Number(orderItems[0].unitPrice)).toBe(150);

    const fetched = await getQuotation(org.id, quotation.id);
    expect(fetched!.order?.id).toBe(order.id);
  });

  it("rejects converting a Quotation that isn't ACCEPTED", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const quotation = await createQuotation(org.id, { customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date() }, actor.id);

    await expect(convertQuotationToOrder(org.id, quotation.id, actor.id)).rejects.toThrow(InvalidQuotationTransitionError);
  });

  it("rejects converting an Accepted Quotation with no event dates set", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const quotation = await createQuotation(org.id, { customerId: customer.id }, actor.id); // no event dates
    const { url } = await sendQuotation(org.id, quotation.id, actor.id);
    const token = url.split("/quote/")[1];
    const resolved = (await resolveQuotationToken(token))!;
    await acceptQuotation(resolved.organizationId, resolved.quotationId);

    await expect(convertQuotationToOrder(org.id, quotation.id, actor.id)).rejects.toThrow(QuotationEventDatesRequiredError);
  });
});
