import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder } from "@/modules/orders/order";
import { createCustomer } from "@/modules/customers/customer";
import { createEventType } from "@/modules/events/event-type";
import { addMenuApprovalNote, getMenuSelection } from "@/modules/menu-approvals/menu-approval";
import { ensureOrderMenuSelection, getActiveApprovalUrl, sendMenuForApproval } from "@/modules/menu-approvals/approval-link";
import { loadMenuApprovalReviewData as loadReview } from "@/modules/menu-approvals/review-data";

/** The caller says whether the viewer may see prices; these tests are the Admin's view unless they say otherwise. */
const loadMenuApprovalReviewData = (organizationId: string, selection: Parameters<typeof loadReview>[1], options: Parameters<typeof loadReview>[2] = {}) => loadReview(organizationId, selection, { showPrices: true, ...options });

/**
 * `loadMenuApprovalReviewData` is the data half of the Menu Approvals review page, moved out of `/menu-approvals/[id]/page.tsx`
 * in Phase 1 of the merge so the Order page can reuse it later. It reads only; permission and location checks stay with the caller.
 */

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.statusChange.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.secureAccessToken.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.menuVersionItem.deleteMany({ where: { menuVersion: { menuSelection: { organizationId: { in: orgIds } } } } });
  await prisma.menuVersion.deleteMany({ where: { menuSelection: { organizationId: { in: orgIds } } } });
  await prisma.menuSelectionItem.deleteMany({ where: { menuSelection: { organizationId: { in: orgIds } } } });
  await prisma.menuApprovalNote.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.menuSelection.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.eventType.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

async function business(name: string) {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name, slug: `rev-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Team", email: `team-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: actor.id, role: "owner", createdAt: new Date() } });
  const customer = await createCustomer(org.id, { name: `${name} Customer`, phone: `98${Math.floor(10000000 + Math.random() * 89999999)}`, email: `c-${crypto.randomUUID()}@example.test` }, actor.id);
  const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
  const order = await createOrder(
    org.id,
    {
      customerId: customer.id,
      eventTypeId: eventType.id,
      eventStartDate: new Date("2026-12-05"),
      eventEndDate: new Date("2026-12-05"),
      totalParticipants: 120,
      adultCount: 100,
      individualPricingEnabled: true,
      mealPlanEntries: [{ date: new Date("2026-12-05"), mealType: "DINNER", price: 400 }],
    },
    actor.id,
  );
  const selection = (await ensureOrderMenuSelection(org.id, order.id, actor.id))!;
  return { org, actor, order, selection };
}

describe("loadMenuApprovalReviewData", () => {
  it("returns the review's data for a menu that has not been sent", async () => {
    const { org, order, selection } = await business("Alpha");
    const loaded = (await getMenuSelection(org.id, selection.id))!;
    const data = (await loadMenuApprovalReviewData(org.id, loaded))!;

    expect(data.menuSelectionId).toBe(selection.id);
    expect(data.status).toBe("DRAFT");
    expect(data.statusLabel).toBe("Needs Review");
    expect(data.orderCompleted).toBe(false);
    expect(data.currentVersion).toBe(1);
    expect(data.header).toMatchObject({ orderId: order.id, customer: "Alpha Customer", guests: 120, kitchen: null });
    expect(data.pricing).toMatchObject({ individualPricingEnabled: true, totalGuests: 120, menuGuests: 100 });
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]).toMatchObject({ date: "2026-12-05", mealType: "DINNER", price: "400" });
    expect(data.days).toEqual(["2026-12-05"]);
    expect(data.versions).toEqual([]);
    expect(data.notes).toEqual([]);
    expect(data.approvalUrl).toBeNull();
    expect(data.viewVersion).toBeNull();
    expect(data.venueDetailsSubmittedAt).toBeNull();
  });

  it("includes sent versions, the live customer link, notes and the version being viewed", async () => {
    const { org, actor, selection } = await business("Beta");
    await sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id);
    await addMenuApprovalNote(org.id, selection.id, { authorType: "TEAM", authorName: "Team", body: "Call the customer", versionNumber: 1 });
    const loaded = (await getMenuSelection(org.id, selection.id))!;
    const data = (await loadMenuApprovalReviewData(org.id, loaded, { viewVersion: 1 }))!;

    expect(data.status).toBe("SENT_TO_CUSTOMER");
    expect(data.statusLabel).toBe("Awaiting Customer Approval");
    expect(data.versions).toHaveLength(1);
    expect(data.versions[0]).toMatchObject({ versionNumber: 1, superseded: false });
    expect(data.versions[0].snapshot?.customerName).toBe("Beta Customer");
    expect(data.approvalUrl).toMatch(/\/menu-approval\//);
    expect(data.notes.map((n) => [n.authorType, n.body, n.versionNumber])).toEqual([["TEAM", "Call the customer", 1]]);
    expect(data.statusHistory.length).toBeGreaterThan(0);
    expect(data.viewVersion).toBe(1);
  });

  it("builds no price, total, charge or per-plate figure when the viewer lacks the order-prices right", async () => {
    const { org, actor, selection } = await business("Prices");
    await sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id);
    const loaded = (await getMenuSelection(org.id, selection.id))!;
    const shown = (await loadMenuApprovalReviewData(org.id, loaded))!;
    const hidden = (await loadReview(org.id, loaded))!; // the default is the safe one: no prices
    expect(shown.showPrices).toBe(true);
    expect(shown.pricing.saved.total).toBeGreaterThan(0);

    expect(hidden.showPrices).toBe(false);
    expect(hidden.customPricePerPlate).toBeNull();
    expect(hidden.pricing.saved).toEqual({ menuAmount: 0, extrasAmount: 0, childrenCharge: 0, chargesAndDiscount: 0, total: 0 });
    expect(hidden.pricing.customChargeLines).toEqual([]);
    expect(hidden.entries.every((e) => e.price === "" && e.items.every((i) => i.unitPrice === 0))).toBe(true);
    expect(hidden.menus.every((m) => m.price === 0 && m.childUnder5Price === null && m.child5To10PriceValue === null)).toBe(true);
    // The frozen versions that were sent carry no total or price either.
    expect(hidden.versions[0].snapshot?.total).toBe(0);
    expect(hidden.versions[0].snapshot?.meals.every((m) => m.price == null && m.items.every((i) => !("unitPrice" in i)))).toBe(true);
    // Everything else is unchanged.
    expect(hidden.header).toEqual(shown.header);
    expect(hidden.status).toBe(shown.status);
  });

  it("returns nothing for a selection with no order", async () => {
    const { org, selection } = await business("Gamma");
    const loaded = (await getMenuSelection(org.id, selection.id))!;
    expect(await loadMenuApprovalReviewData(org.id, { ...loaded, event: { ...loaded.event, orderId: null } })).toBeNull();
  });

  it("never reads another business's order: the caller's own business id scopes every read", async () => {
    const a = await business("Delta");
    const b = await business("Epsilon");
    // The page only ever loads a selection through getMenuSelection(organizationId, id), which refuses another business's id.
    expect(await getMenuSelection(a.org.id, b.selection.id)).toBeNull();
    // Even handed a foreign selection by mistake, the loader reads with the caller's business id and finds no order.
    const foreign = (await getMenuSelection(b.org.id, b.selection.id))!;
    expect(await loadMenuApprovalReviewData(a.org.id, foreign)).toBeNull();
  });

  // The customer's page is a frozen copy. An ordinary edit is refused while the menu is with the customer (price freeze), but an
  // order sent before that rule, or changed some other way, can differ from what the customer sees. These edits go straight to the row.
  describe("freshness: does the customer's page still match the order?", () => {
    it("is null before the menu is sent, and not stale right after it is", async () => {
      const { org, actor, selection } = await business("Zeta");
      const unsent = await loadMenuApprovalReviewData(org.id, (await getMenuSelection(org.id, selection.id))!);
      expect(unsent!.freshness).toBeNull();

      await sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id);
      const sent = await loadMenuApprovalReviewData(org.id, (await getMenuSelection(org.id, selection.id))!);
      expect(sent!.freshness).toMatchObject({ stale: false, reasons: [] });
    });

    it("notices changed adults, children and price, and says what the customer sees", async () => {
      const { org, actor, order, selection } = await business("Eta");
      await sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id);
      const sentTotal = Number(order.total);
      await prisma.order.update({ where: { id: order.id }, data: { adultCount: 80, childBelow5Count: 5, totalParticipants: 105, total: sentTotal - 5000 } });

      const data = await loadMenuApprovalReviewData(org.id, (await getMenuSelection(org.id, selection.id))!);
      expect(data!.freshness!.stale).toBe(true);
      expect(data!.freshness!.sentTotal).toBe(sentTotal);
      expect(data!.freshness!.currentTotal).toBe(sentTotal - 5000);
      expect(data!.freshness!.reasons).toEqual(expect.arrayContaining(["Adults changed (100 to 80)", "Children under 5 changed (0 to 5)"]));
      // Viewing a frozen version never nags about the live order.
      const viewing = await loadMenuApprovalReviewData(org.id, (await getMenuSelection(org.id, selection.id))!, { viewVersion: 1 });
      expect(viewing!.freshness).toBeNull();
    });

    it("notices a changed dish or menu in a meal", async () => {
      const { org, actor, order, selection } = await business("Theta");
      await sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id);
      const meal = await prisma.mealPlanEntry.findFirstOrThrow({ where: { orderId: order.id } });
      await prisma.orderItem.create({ data: { orderId: order.id, mealPlanEntryId: meal.id, itemType: "MENU_ITEM", name: "Gulab Jamun", unitPrice: 50, quantity: 1, isExtra: false } });
      const data = await loadMenuApprovalReviewData(org.id, (await getMenuSelection(org.id, selection.id))!);
      expect(data!.freshness!.reasons.join(" | ")).toContain("dishes or add-ons changed (Gulab Jamun)");
    });

    it("Resend updated menu sends the current order as the next version and ends the old link; a plain send is still refused", async () => {
      const { org, actor, order, selection } = await business("Iota");
      const first = await sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id);
      await prisma.order.update({ where: { id: order.id }, data: { adultCount: 70, totalParticipants: 70 } });

      await expect(sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id)).rejects.toThrow(/already with the customer/);

      const second = await sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id, undefined, { replaceLive: true });
      expect(second.versionNumber).toBe(first.versionNumber + 1);
      expect(second.url).not.toBe(first.url);
      expect(await getActiveApprovalUrl(org.id, selection.id)).toBe(second.url);
      const oldToken = first.url.split("/").pop()!;
      expect((await prisma.secureAccessToken.findUniqueOrThrow({ where: { token: oldToken } })).revokedAt).not.toBeNull();

      const loaded = (await getMenuSelection(org.id, selection.id))!;
      expect(loaded.status).toBe("CUSTOMER_REVIEWING");
      const data = await loadMenuApprovalReviewData(org.id, loaded);
      expect(data!.freshness).toMatchObject({ stale: false });
      expect(data!.versions.map((v) => [v.versionNumber, v.superseded])).toEqual(expect.arrayContaining([[1, true], [2, false]]));
      // A second resend from Customer Reviewing works too.
      const third = await sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id, undefined, { replaceLive: true });
      expect(third.versionNumber).toBe(3);
    });
  });
});
