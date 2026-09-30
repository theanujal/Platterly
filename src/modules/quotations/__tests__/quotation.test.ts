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
import { createMenu } from "@/modules/menus/menu";
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
  await prisma.menu.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
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

describe("Quotation CRUD (Chunk 10 Group 10.1 + item-picker parity, 2026-09-28)", () => {
  it("createQuotation defaults status to DRAFT and computes totals from meal-plan items", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menuItem = await createMenuItem(org.id, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 150 }, actor.id);

    const quotation = await createQuotation(
      org.id,
      {
        customerId: customer.id,
        discount: 50,
        taxes: 20,
        additionalCharges: 10,
        deliveryCharges: 5,
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", items: [{ itemType: "MENU_ITEM", catalogId: menuItem.id, quantity: 4, isExtra: true }] }],
      },
      actor.id,
    );

    expect(quotation.status).toBe("DRAFT");
    expect(Number(quotation.subtotal)).toBe(600);
    expect(Number(quotation.total)).toBe(600 - 50 + 20 + 10 + 5);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "quotation.create", recordId: quotation.id } });
    expect(log).not.toBeNull();
  });

  it("updateQuotation syncs meal-plan entries and recalculates totals", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const cheap = await createMenuItem(org.id, { name: "Salad", foodType: "VEGETARIAN", price: 50 }, actor.id);
    const pricier = await createMenuItem(org.id, { name: "Biryani", foodType: "NON_VEGETARIAN", price: 300 }, actor.id);
    const quotation = await createQuotation(
      org.id,
      { customerId: customer.id, mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", items: [{ itemType: "MENU_ITEM", catalogId: cheap.id, quantity: 1, isExtra: true }] }] },
      actor.id,
    );

    const updated = await updateQuotation(
      org.id,
      quotation.id,
      { customerId: customer.id, mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", items: [{ itemType: "MENU_ITEM", catalogId: pricier.id, quantity: 2, isExtra: true }] }] },
      actor.id,
    );
    expect(Number(updated.subtotal)).toBe(600);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "quotation.update", recordId: quotation.id } });
    expect(log).not.toBeNull();
  });

  it("unchecking a previously-selected slot deletes it and cascades its items", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(org.id, { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 100 }, actor.id);
    const item = await createMenuItem(org.id, { name: "Item", foodType: "VEGETARIAN", price: 10 }, actor.id);
    const quotation = await createQuotation(
      org.id,
      {
        customerId: customer.id,
        orderKind: "MULTI",
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id, items: [{ itemType: "MENU_ITEM", catalogId: item.id, quantity: 1, isExtra: true }] }],
      },
      actor.id,
    );
    const entryId = (await getQuotation(org.id, quotation.id))!.mealPlanEntries[0].id;

    await updateQuotation(org.id, quotation.id, { customerId: customer.id, orderKind: "MULTI", mealPlanEntries: [] }, actor.id);

    expect(await prisma.quotationMealPlanEntry.findUnique({ where: { id: entryId } })).toBeNull();
    expect(await prisma.quotationItem.count({ where: { mealPlanEntryId: entryId } })).toBe(0);
  });

  it("resaving an unchanged slot preserves its id and items — not a blind delete+recreate", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(org.id, { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 100 }, actor.id);
    const item = await createMenuItem(org.id, { name: "Item", foodType: "VEGETARIAN", price: 10 }, actor.id);
    const quotation = await createQuotation(
      org.id,
      { customerId: customer.id, mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id, items: [{ itemType: "MENU_ITEM", catalogId: item.id, quantity: 1, isExtra: true }] }] },
      actor.id,
    );
    const entryId = (await getQuotation(org.id, quotation.id))!.mealPlanEntries[0].id;

    await updateQuotation(
      org.id,
      quotation.id,
      { customerId: customer.id, mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id, items: [{ itemType: "MENU_ITEM", catalogId: item.id, quantity: 1, isExtra: true }] }] },
      actor.id,
    );

    const after = await getQuotation(org.id, quotation.id);
    expect(after!.mealPlanEntries[0].id).toBe(entryId);
    expect(after!.mealPlanEntries[0].items).toHaveLength(1);
  });

  it("a cross-tenant menuId on a meal slot is rejected", async () => {
    const org = await makeOrg();
    const otherOrg = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const otherMenu = await createMenu(otherOrg.id, { name: "Someone Else's Menu", menuType: "VEGETARIAN", pricePerPlate: 100 }, actor.id);

    await expect(
      createQuotation(org.id, { customerId: customer.id, mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: otherMenu.id }] }, actor.id),
    ).rejects.toThrow();
  });

  it("deleteQuotation hard-deletes and cascades meal-plan entries and items", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menuItem = await createMenuItem(org.id, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 150 }, actor.id);
    const quotation = await createQuotation(
      org.id,
      { customerId: customer.id, mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", items: [{ itemType: "MENU_ITEM", catalogId: menuItem.id, quantity: 1, isExtra: true }] }] },
      actor.id,
    );

    await deleteQuotation(org.id, quotation.id, actor.id);

    expect(await getQuotation(org.id, quotation.id)).toBeNull();
    expect(await prisma.quotationItem.count({ where: { quotationId: quotation.id } })).toBe(0);
    expect(await prisma.quotationMealPlanEntry.count({ where: { quotationId: quotation.id } })).toBe(0);
  });

  it("listQuotations `upcoming` hides Expired quotations and those whose event is over", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const day = (offset: number) => {
      const n = new Date();
      return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + offset));
    };
    const make = (data: { eventStartDate?: Date; eventEndDate?: Date; status?: "DRAFT" | "EXPIRED" }) =>
      prisma.quotation.create({ data: { organizationId: org.id, customerId: customer.id, ...data } });
    const noDates = await make({});
    const future = await make({ eventStartDate: day(4), eventEndDate: day(5) });
    const underway = await make({ eventStartDate: day(-1), eventEndDate: day(2) });
    const startOnlyFuture = await make({ eventStartDate: day(1) });
    await make({ eventStartDate: day(-8), eventEndDate: day(-7) }); // event over
    await make({ eventStartDate: day(-3) }); // start-only, over
    await make({ eventStartDate: day(6), eventEndDate: day(6), status: "EXPIRED" }); // expired

    const upcoming = (await listQuotations(org.id, { when: "upcoming" })).map((q) => q.id).sort();
    expect(upcoming).toEqual([noDates.id, future.id, underway.id, startOnlyFuture.id].sort());
    expect(await listQuotations(org.id)).toHaveLength(7);
  });

  it("listQuotations `excludeConverted` drops a Quotation once it has become an Order", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const open = await createQuotation(org.id, { customerId: customer.id }, actor.id);
    const converted = await createQuotation(
      org.id,
      { customerId: customer.id, eventStartDate: new Date("2099-12-01"), eventEndDate: new Date("2099-12-01") },
      actor.id,
    );
    await prisma.quotation.update({ where: { id: converted.id }, data: { status: "ACCEPTED" } });
    await convertQuotationToOrder(org.id, converted.id, actor.id);

    expect((await listQuotations(org.id)).map((q) => q.id).sort()).toEqual([open.id, converted.id].sort());
    expect((await listQuotations(org.id, { excludeConverted: true })).map((q) => q.id)).toEqual([open.id]);
    // The Quotation itself is kept, and still points at its Order.
    expect((await prisma.quotation.findUniqueOrThrow({ where: { id: converted.id }, include: { order: true } })).order).not.toBeNull();
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

  it("recalculateQuotationTotals sums every meal slot's own items together", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menuA = await createMenu(org.id, { name: "Menu A", menuType: "VEGETARIAN", pricePerPlate: 100 }, actor.id);
    const menuB = await createMenu(org.id, { name: "Menu B", menuType: "VEGETARIAN", pricePerPlate: 100 }, actor.id);
    const itemA = await createMenuItem(org.id, { name: "Item A", foodType: "VEGETARIAN", price: 40 }, actor.id);
    const itemB = await createMenuItem(org.id, { name: "Item B", foodType: "VEGETARIAN", price: 60 }, actor.id);

    const quotation = await createQuotation(
      org.id,
      {
        customerId: customer.id,
        orderKind: "MULTI",
        mealPlanEntries: [
          { date: new Date("2026-12-01"), mealType: "BREAKFAST", menuId: menuA.id, items: [{ itemType: "MENU_ITEM", catalogId: itemA.id, quantity: 1, isExtra: true }] }, // 40
          { date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menuB.id, items: [{ itemType: "MENU_ITEM", catalogId: itemB.id, quantity: 2, isExtra: true }] }, // 120
        ],
      },
      actor.id,
    );

    expect(Number(quotation.subtotal)).toBe(40 + 120);
  });

  it("individualPricingEnabled folds each meal's own price into the subtotal", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);

    const quotation = await createQuotation(
      org.id,
      {
        customerId: customer.id,
        individualPricingEnabled: true,
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "DINNER", price: 500 }],
      },
      actor.id,
    );

    expect(Number(quotation.subtotal)).toBe(500);
  });
});

describe("Children Guests & Pricing on Quotation (mirrors Order's formula)", () => {
  it("STANDARD prices against the first Meal Planning entry's own Menu", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(org.id, { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 200, childUnder5Chargeable: true, childUnder5Price: 50 }, actor.id);

    const quotation = await createQuotation(
      org.id,
      {
        customerId: customer.id,
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id }],
        childBelow5Count: 2,
      },
      actor.id,
    );

    expect(Number(quotation.childrenCharge)).toBe(100);
  });

  it("INDIVIDUAL pricing charges a Percentage-of-Menu-price rate for one band and a flat Per Plate rate for the other", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(org.id, { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 400 }, actor.id);

    const quotation = await createQuotation(
      org.id,
      {
        customerId: customer.id,
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id }],
        pricingMethod: "INDIVIDUAL",
        childBelow5Count: 2,
        individualChildBelow5Rate: 25, // 25% of 400 = 100/child
        individualChildBelow5PricingType: "PERCENTAGE",
        child5To10Count: 3,
        individualChild5To10Rate: 120, // flat ₹120/child
        individualChild5To10PricingType: "FIXED",
      },
      actor.id,
    );

    expect(Number(quotation.childrenCharge)).toBe(2 * 100 + 3 * 120);
  });

  it("no meal with an assigned Menu yet charges nothing even with non-zero counts", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);

    const quotation = await createQuotation(org.id, { customerId: customer.id, childBelow5Count: 5, child5To10Count: 5 }, actor.id);

    expect(Number(quotation.childrenCharge)).toBe(0);
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

describe("convertQuotationToOrder — item-picker parity (2026-09-28): real MealPlanEntry rows, not flattened", () => {
  it("maps each QuotationMealPlanEntry 1:1 onto a real Order MealPlanEntry, preserving the frozen item snapshot even if the live catalog price has since changed", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const menu = await createMenu(org.id, { name: "Wedding Menu", menuType: "VEGETARIAN", pricePerPlate: 200 }, actor.id);
    const menuItem = await createMenuItem(org.id, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 150 }, actor.id);

    const quotation = await createQuotation(
      org.id,
      {
        customerId: customer.id,
        eventTypeId: eventType.id,
        menuPreference: "VEGETARIAN",
        orderKind: "MULTI",
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-02"),
        venue: "Taj Hall",
        adultCount: 100,
        childBelow5Count: 2,
        pricingMethod: "STANDARD",
        discount: 50,
        taxes: 20,
        additionalCharges: 10,
        deliveryCharges: 5,
        mealPlanEntries: [
          { date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id, items: [{ itemType: "MENU_ITEM", catalogId: menuItem.id, quantity: 4, isExtra: true }] },
          { date: new Date("2026-12-02"), mealType: "DINNER", menuId: menu.id, items: [{ itemType: "MENU_ITEM", catalogId: menuItem.id, quantity: 2, isExtra: true }] },
        ],
      },
      actor.id,
    );
    const { url } = await sendQuotation(org.id, quotation.id, actor.id);
    const token = url.split("/quote/")[1];
    const resolved = (await resolveQuotationToken(token))!;
    await acceptQuotation(resolved.organizationId, resolved.quotationId);

    // Live catalog price changes after the quotation was made — the converted
    // Order must still bill the frozen ₹150 snapshot, never the new ₹999.
    await prisma.menuItem.update({ where: { id: menuItem.id }, data: { price: 999 } });

    const order = await convertQuotationToOrder(org.id, quotation.id, actor.id);

    expect(order.customerId).toBe(customer.id);
    expect(order.eventTypeId).toBe(eventType.id);
    expect(order.quotationId).toBe(quotation.id);
    expect(order.menuPreference).toBe("VEGETARIAN");
    expect(order.orderKind).toBe("MULTI");
    expect(order.adultCount).toBe(100);
    expect(order.pricingMethod).toBe("STANDARD");

    const fullOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { mealPlanEntries: { include: { items: true }, orderBy: { date: "asc" } } },
    });
    expect(fullOrder.mealPlanEntries).toHaveLength(2);
    expect(fullOrder.mealPlanEntries[0].mealType).toBe("LUNCH");
    expect(fullOrder.mealPlanEntries[0].items).toHaveLength(1);
    expect(fullOrder.mealPlanEntries[0].items[0].name).toBe("Paneer Tikka");
    expect(Number(fullOrder.mealPlanEntries[0].items[0].unitPrice)).toBe(150); // frozen snapshot, not the live 999
    expect(fullOrder.mealPlanEntries[1].mealType).toBe("DINNER");
    expect(fullOrder.mealPlanEntries[1].items).toHaveLength(1);

    // Two meals on a 200/plate Menu for 100 adults = 40000, plus the Extras' frozen 150*4 + 150*2 = 900;
    // childrenCharge = 0 (Menu has no child rates set);
    // total = 40900 - 50 (discount) + 35 (otherCharges = taxes+additional+delivery)
    expect(Number(order.subtotal)).toBe(40900);
    expect(Number(order.otherCharges)).toBe(35);
    expect(Number(order.total)).toBe(40900 - 50 + 35);
    expect(Number(order.balance)).toBe(Number(order.total));

    const fetched = await getQuotation(org.id, quotation.id);
    expect(fetched!.order?.id).toBe(order.id);
  });

  it("derives childPricingMenuId over the real written meal-plan structure, pricing children correctly post-conversion", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(org.id, { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 200, childUnder5Chargeable: true, childUnder5Price: 50 }, actor.id);

    const quotation = await createQuotation(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        childBelow5Count: 2,
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id }],
      },
      actor.id,
    );
    expect(Number(quotation.childrenCharge)).toBe(100);
    const { url } = await sendQuotation(org.id, quotation.id, actor.id);
    const token = url.split("/quote/")[1];
    const resolved = (await resolveQuotationToken(token))!;
    await acceptQuotation(resolved.organizationId, resolved.quotationId);

    const order = await convertQuotationToOrder(org.id, quotation.id, actor.id);

    expect(order.childPricingMenuId).toBe(menu.id);
    expect(Number(order.childrenCharge)).toBe(100);
  });

  it("legacy flat items (mealPlanEntryId: null, pre-parity artifacts) still convert as whole-order OrderItems, informational only (same convention Order already uses for its own carried-over items)", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menuItem = await createMenuItem(org.id, { name: "Legacy Item", foodType: "VEGETARIAN", price: 80 }, actor.id);
    const quotation = await createQuotation(org.id, { customerId: customer.id, eventStartDate: new Date("2026-12-01"), eventEndDate: new Date("2026-12-01") }, actor.id);
    // Simulate a pre-parity row: a QuotationItem with no mealPlanEntryId, written directly (the new form can't produce this anymore).
    await prisma.quotationItem.create({ data: { quotationId: quotation.id, itemType: "MENU_ITEM", menuItemId: menuItem.id, name: "Legacy Item", unitPrice: 80, quantity: 3 } });
    const { url } = await sendQuotation(org.id, quotation.id, actor.id);
    const token = url.split("/quote/")[1];
    const resolved = (await resolveQuotationToken(token))!;
    await acceptQuotation(resolved.organizationId, resolved.quotationId);

    const order = await convertQuotationToOrder(org.id, quotation.id, actor.id);

    const orderItems = await prisma.orderItem.findMany({ where: { orderId: order.id, mealPlanEntryId: null } });
    expect(orderItems).toHaveLength(1);
    expect(orderItems[0].name).toBe("Legacy Item");
    // recalculateOrderTotals (like the rest of the app since the 2026-09-20 redesign) only
    // sums items scoped to a MealPlanEntry — a flat/carried-over item is informational only,
    // shown as a separate recap on the Order detail page (order-form.tsx's carriedOverItemsSubtotal),
    // never folded into the real stored subtotal. This is the same convention Order's own
    // pre-redesign carried-over items already follow, not a new gap introduced here.
    expect(Number(order.subtotal)).toBe(0);
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
