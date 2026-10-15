import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { setCustomMenuPricePerPlate, InvalidMenuSelectionTransitionError } from "@/modules/menu-approvals/menu-approval";
import { sendMenuForApproval, recallMenuFromCustomer, approveViaLink, CUSTOM_QUOTE_MISSING_MESSAGE } from "@/modules/menu-approvals/approval-link";
import { changeStatusManually, ManualStatusChangeError } from "@/modules/menu-approvals/manual-status";
import { updateOrder, recalculateOrderTotals } from "@/modules/orders/order";
import { OrderLockedError } from "@/modules/orders/order-lock";
import { cleanupWorlds, newBusiness } from "./phase2-world";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";

/**
 * Decisions 13 and 14 of the Menu Approvals + Orders merge: a custom menu is quoted before it can be sent, a quote is only possible
 * while the menu is still with the team, and no status change can stand in for the customer's approval of a new price.
 */

afterEach(cleanupWorlds);

async function customBusiness() {
  const b = await newBusiness();
  const { order, selection } = await b.makeOrder();
  // A custom menu: the customer picked dishes with no Menu, so the meal has no menu and no price until the kitchen quotes one.
  await prisma.menuSelection.update({ where: { id: selection.id }, data: { isCustomMenu: true } });
  await prisma.mealPlanEntry.updateMany({ where: { orderId: order.id }, data: { menuId: null, price: null } });
  await recalculateOrderTotals(order.id);
  return { b, order, selection };
}

const totalOf = async (orderId: string) => Number((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).total);

describe("a custom menu is quoted before it can be sent", () => {
  it("refuses to send an unquoted custom menu, with a message that says what is missing, and changes nothing", async () => {
    const { b, order, selection } = await customBusiness();
    const refused = await sendMenuForApproval(b.org.id, { menuSelectionId: selection.id }, b.owner.user.id).catch((e) => e);
    expect(refused).toBeInstanceOf(InvalidMenuSelectionTransitionError);
    expect(refused.message).toBe(CUSTOM_QUOTE_MISSING_MESSAGE);
    expect(refused.message).toMatch(/price per plate/i);
    expect(await prisma.menuVersion.count({ where: { menuSelectionId: selection.id } })).toBe(0);
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).status).toBe("DRAFT");
    expect(await prisma.secureAccessToken.count({ where: { organizationId: b.org.id } })).toBe(0);
    expect(await totalOf(order.id)).toBe(0); // no price was assigned for them
  });

  it("sends once it has been quoted, a zero quote included", async () => {
    const { b, order, selection } = await customBusiness();
    await setCustomMenuPricePerPlate(b.org.id, selection.id, 250, b.owner.user.id);
    expect(await totalOf(order.id)).toBe(100 * 250);
    const sent = await sendMenuForApproval(b.org.id, { menuSelectionId: selection.id }, b.owner.user.id);
    expect(sent.versionNumber).toBe(1);

    const free = await customBusiness();
    await setCustomMenuPricePerPlate(free.b.org.id, free.selection.id, 0, free.b.owner.user.id);
    expect((await sendMenuForApproval(free.b.org.id, { menuSelectionId: free.selection.id }, free.b.owner.user.id)).versionNumber).toBe(1);
  });

  it("a menu on a fixed Menu is not affected", async () => {
    const b = await newBusiness();
    const { selection } = await b.makeOrder();
    expect((await sendMenuForApproval(b.org.id, { menuSelectionId: selection.id }, b.owner.user.id)).versionNumber).toBe(1);
  });
});

describe("the custom-menu quote", () => {
  it("is only possible in Needs Review and Changes Requested, and a refused quote changes nothing", async () => {
    const { b, order, selection } = await customBusiness();
    await setCustomMenuPricePerPlate(b.org.id, selection.id, 250, b.owner.user.id);
    for (const status of ["SENT_TO_CUSTOMER", "CUSTOMER_REVIEWING", "CUSTOMER_APPROVED", "FINAL_LOCKED"] as MenuSelectionStatus[]) {
      await prisma.menuSelection.update({ where: { id: selection.id }, data: { status } });
      const refused = await setCustomMenuPricePerPlate(b.org.id, selection.id, 999, b.owner.user.id).catch((e) => e);
      expect(refused, status).toBeInstanceOf(status === "FINAL_LOCKED" ? OrderLockedError : InvalidMenuSelectionTransitionError);
      expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).customPricePerPlate?.toString()).toBe("250");
      expect(await totalOf(order.id)).toBe(25000);
    }
    await prisma.menuSelection.update({ where: { id: selection.id }, data: { status: "CHANGES_REQUESTED" } });
    await setCustomMenuPricePerPlate(b.org.id, selection.id, 300, b.owner.user.id);
    expect(await totalOf(order.id)).toBe(30000);
  });

  it("is audited with the price and total before and after", async () => {
    const { b, selection } = await customBusiness();
    await setCustomMenuPricePerPlate(b.org.id, selection.id, 250, b.owner.user.id);
    await setCustomMenuPricePerPlate(b.org.id, selection.id, 275, b.owner.user.id);
    const entries = await prisma.auditLog.findMany({ where: { organizationId: b.org.id, action: "menu_selection.custom_price_set" }, orderBy: { createdAt: "asc" } });
    expect(entries.map((e) => [e.before, e.after])).toEqual([
      [{ pricePerPlate: null, orderTotal: 0 }, { pricePerPlate: 250, orderTotal: 25000, guests: 100, mealsPriced: 1 }],
      [{ pricePerPlate: 250, orderTotal: 25000 }, { pricePerPlate: 275, orderTotal: 27500, guests: 100, mealsPriced: 1 }],
    ]);
    expect(entries.every((e) => e.actorUserId === b.owner.user.id)).toBe(true);
  });

  it("a quote and a send at the same moment: the quote either lands before the version or is refused, never after", async () => {
    for (let round = 0; round < 5; round++) {
      const { b, order, selection } = await customBusiness();
      await setCustomMenuPricePerPlate(b.org.id, selection.id, 250, b.owner.user.id);
      const [, sent] = await Promise.allSettled([
        setCustomMenuPricePerPlate(b.org.id, selection.id, 400, b.owner.user.id),
        sendMenuForApproval(b.org.id, { menuSelectionId: selection.id }, b.owner.user.id),
      ]);
      expect(sent.status).toBe("fulfilled");
      const version = await prisma.menuVersion.findFirstOrThrow({ where: { menuSelectionId: selection.id } });
      expect((version.snapshot as { total: number }).total).toBe(await totalOf(order.id));
    }
  });
});

describe("a status change cannot stand in for the customer's approval of a new price", () => {
  async function approvedThenRecalled() {
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    const sent = await sendMenuForApproval(b.org.id, { menuSelectionId: selection.id }, b.owner.user.id);
    await approveViaLink(sent.url.split("/menu-approval/")[1]);
    return { b, order, selection };
  }

  it("refuses a manual move to Customer Approved or the kitchen while the price differs from what the customer last saw", async () => {
    const { b, order, selection } = await approvedThenRecalled();
    await recallMenuFromCustomer(b.org.id, selection.id, b.owner.user.id);
    await updateOrder(b.org.id, order.id, { customerId: order.customerId, eventStartDate: order.eventStartDate, eventEndDate: order.eventEndDate, discount: 1000 }, b.owner.user.id);
    for (const target of ["CUSTOMER_APPROVED", "FINAL_LOCKED"] as const) {
      const refused = await changeStatusManually(b.org.id, { menuSelectionId: selection.id, target: { kind: "MENU", status: target }, reason: "agreed by phone", actorUserId: b.owner.user.id }).catch((e) => e);
      expect(refused, target).toBeInstanceOf(ManualStatusChangeError);
      expect(refused.message).toMatch(/price has changed since the customer last saw/);
    }
    const viaOrder = await changeStatusManually(b.org.id, { orderId: order.id, target: { kind: "ORDER", status: "SENT_TO_KITCHEN" }, reason: "agreed by phone", actorUserId: b.owner.user.id }).catch((e) => e);
    expect(viaOrder).toBeInstanceOf(ManualStatusChangeError);
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).status).toBe("DRAFT");
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(0); // no hand-off happened
  });

  it("the legitimate route works: send the updated menu and let the customer approve it", async () => {
    const { b, order, selection } = await approvedThenRecalled();
    await recallMenuFromCustomer(b.org.id, selection.id, b.owner.user.id);
    await updateOrder(b.org.id, order.id, { customerId: order.customerId, eventStartDate: order.eventStartDate, eventEndDate: order.eventEndDate, discount: 1000 }, b.owner.user.id);
    const second = await sendMenuForApproval(b.org.id, { menuSelectionId: selection.id }, b.owner.user.id);
    expect(second.versionNumber).toBe(2);
    await approveViaLink(second.url.split("/menu-approval/")[1]);
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).status).toBe("CUSTOMER_APPROVED");
    await changeStatusManually(b.org.id, { menuSelectionId: selection.id, target: { kind: "MENU", status: "FINAL_LOCKED" }, reason: "ready for the kitchen", actorUserId: b.owner.user.id });
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).status).toBe("FINAL_LOCKED");
  });

  it("still allows a move when the price is the one the customer saw, when nothing was ever sent, and any move backwards", async () => {
    const { b, order, selection } = await approvedThenRecalled();
    await recallMenuFromCustomer(b.org.id, selection.id, b.owner.user.id);
    // unchanged price: back to approved by hand is fine
    await changeStatusManually(b.org.id, { menuSelectionId: selection.id, target: { kind: "MENU", status: "CUSTOMER_APPROVED" }, reason: "recalled by mistake", actorUserId: b.owner.user.id });
    // backwards from the kitchen
    await changeStatusManually(b.org.id, { menuSelectionId: selection.id, target: { kind: "MENU", status: "FINAL_LOCKED" }, reason: "ready", actorUserId: b.owner.user.id });
    await changeStatusManually(b.org.id, { menuSelectionId: selection.id, target: { kind: "MENU", status: "DRAFT" }, reason: "sent by mistake", actorUserId: b.owner.user.id });
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).status).toBe("DRAFT");

    // nothing ever sent: an agreement made by phone still works whatever the price
    const fresh = await newBusiness();
    const f = await fresh.makeOrder();
    await changeStatusManually(fresh.org.id, { menuSelectionId: f.selection.id, target: { kind: "MENU", status: "CUSTOMER_APPROVED" }, reason: "agreed by phone", actorUserId: fresh.owner.user.id });
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: f.selection.id } })).status).toBe("CUSTOMER_APPROVED");
    expect(order.id).toBeTruthy();
  });
});
