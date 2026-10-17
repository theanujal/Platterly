import { describe, it, expect, afterEach, vi } from "vitest";

// The real Server Actions with the real sign-in, role, permission and location checks. Only the session itself is faked: who is
// signed in and which business is active. Nothing about permissions or locations is stubbed. (Same approach as
// recipe-status-permission.test.ts.)
const who = vi.hoisted(() => ({ userId: "", activeOrganizationId: "" }));
vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({ user: { id: who.userId, email: "x@example.test" }, session: { activeOrganizationId: who.activeOrganizationId } }),
      setActiveOrganization: async () => undefined,
    },
  },
}));
vi.mock("@/modules/ops-link/entitlements", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/modules/ops-link/entitlements")>()), isLocked: async () => false }));
vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw Object.assign(new Error("FORBIDDEN"), { digest: "NEXT_HTTP_ERROR_FALLBACK;403" });
  },
  redirect: (to: string) => {
    throw Object.assign(new Error(`REDIRECT ${to}`), { digest: `NEXT_REDIRECT;${to}` });
  },
  notFound: () => {
    throw Object.assign(new Error("NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

import { prisma } from "@/lib/db";
import { defaultGrants, saveRoleGrants } from "@/modules/roles/role-grants";
import { addLocation, setMultiLocationEnabled } from "@/modules/locations/locations";
import { setMemberLocation } from "@/modules/team/team";
import { sendMenuForApproval } from "@/modules/menu-approvals/approval-link";
import { recalculateOrderTotals } from "@/modules/orders/order";
import {
  addMenuApprovalNoteAction,
  setCustomMenuPriceAction,
  startMenuApprovalAction,
  updateMenuApprovalMealPlanAction,
  sendMenuForApprovalAction,
  recallMenuAction,
  approveAndSendToKitchenAction,
  changeMenuStatusAction,
} from "@/app/(app)/menu-approvals/actions";
import { updateOrderAction } from "@/app/(app)/orders/actions";
import { cleanupWorlds, newBusiness, orgIds } from "./phase2-world";

afterEach(async () => {
  await prisma.subscription.deleteMany({ where: { organizationId: { in: orgIds } } });
  await cleanupWorlds();
  await prisma.subscriptionPlan.deleteMany({ where: { code: { startsWith: "p2-" } } });
});

const signedInAs = (user: { id: string }, organizationId: string) => {
  who.userId = user.id;
  who.activeOrganizationId = organizationId;
};
const isForbidden = (error: unknown) => String((error as { digest?: string }).digest ?? error).includes("403");
const isNotFound = (error: unknown) => String((error as { digest?: string }).digest ?? error).includes("404");
const meal = [{ date: "2026-12-05", mealType: "DINNER" as const, price: 500, menuId: null, items: [] }];

/** A role that may approve menus but not edit orders: salesEvents with order editing taken away by the business's own role settings. */
async function approvalOnlyPerson(b: Awaited<ReturnType<typeof newBusiness>>) {
  await saveRoleGrants(b.org.id, "salesEvents", { ...defaultGrants("salesEvents"), orders: ["view"] }, b.owner.user.id);
  return b.person("salesEvents");
}

/** A manager whose business has taken menu approval away (the Manager preset approves menus since the 2026-10-17 redesign). */
async function managerWithoutApproval(b: Awaited<ReturnType<typeof newBusiness>>) {
  await saveRoleGrants(b.org.id, "manager", { ...defaultGrants("manager"), menus: ["view", "create", "edit"] }, b.owner.user.id);
  return b.person("manager");
}

async function customMenuOrder(b: Awaited<ReturnType<typeof newBusiness>>) {
  const made = await b.makeOrder();
  await prisma.menuSelection.update({ where: { id: made.selection.id }, data: { isCustomMenu: true } });
  await prisma.mealPlanEntry.updateMany({ where: { orderId: made.order.id }, data: { menuId: null, price: null } });
  await recalculateOrderTotals(made.order.id);
  return made;
}

describe("custom-menu quote: menus: approve AND orders: edit", () => {
  it("an owner, and a sales & event team member once the Admin has granted order prices, can quote", async () => {
    const b = await newBusiness();
    const { selection } = await customMenuOrder(b);
    signedInAs(b.owner.user, b.org.id);
    expect(await setCustomMenuPriceAction(selection.id, 250)).toEqual({ ok: true });
    const sales = await b.person("salesEvents");
    expect(defaultGrants("salesEvents")).toMatchObject({ orders: expect.arrayContaining(["edit"]), menus: expect.arrayContaining(["approve"]) });
    // Both module permissions are not enough: quoting sets an order price, so it needs that right too (Roles & Permissions redesign, 2026-10-17).
    signedInAs(sales.user, b.org.id);
    expect(isForbidden(await setCustomMenuPriceAction(selection.id, 260).catch((e) => e))).toBe(true);
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).customPricePerPlate?.toString()).toBe("250");
    await saveRoleGrants(b.org.id, "salesEvents", { ...defaultGrants("salesEvents"), sensitive: ["orderPrices"] }, b.owner.user.id);
    expect(await setCustomMenuPriceAction(selection.id, 260)).toEqual({ ok: true });
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).customPricePerPlate?.toString()).toBe("260");
    // Taking the right away again stops it at once.
    await saveRoleGrants(b.org.id, "salesEvents", { ...defaultGrants("salesEvents"), sensitive: [] }, b.owner.user.id);
    expect(isForbidden(await setCustomMenuPriceAction(selection.id, 270).catch((e) => e))).toBe(true);
  });

  it("an approval-only user is refused on the server, and nothing is written or audited", async () => {
    const b = await newBusiness();
    const { selection, order } = await customMenuOrder(b);
    const user = await approvalOnlyPerson(b);
    signedInAs(user.user, b.org.id);
    const refused = await setCustomMenuPriceAction(selection.id, 250).catch((e) => e);
    expect(isForbidden(refused), String(refused)).toBe(true);
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).customPricePerPlate).toBeNull();
    expect(Number((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).total)).toBe(0);
    expect(await prisma.auditLog.count({ where: { organizationId: b.org.id, action: "menu_selection.custom_price_set" } })).toBe(0);
  });

  it("someone who can edit orders but not approve menus is refused too", async () => {
    const b = await newBusiness();
    const { selection } = await customMenuOrder(b);
    const manager = await managerWithoutApproval(b);
    signedInAs(manager.user, b.org.id);
    expect(isForbidden(await setCustomMenuPriceAction(selection.id, 250).catch((e) => e))).toBe(true);
  });

  it("a send of an unquoted custom menu by an approval-only user is refused with the reason, and a quoted one goes", async () => {
    const b = await newBusiness();
    const { selection } = await customMenuOrder(b);
    const user = await approvalOnlyPerson(b);
    signedInAs(user.user, b.org.id);
    const refused = await sendMenuForApprovalAction({ menuSelectionId: selection.id });
    expect(refused.ok).toBe(false);
    expect(refused.ok ? "" : refused.error).toMatch(/no price yet.*price per plate/i);
    signedInAs(b.owner.user, b.org.id);
    await setCustomMenuPriceAction(selection.id, 250);
    signedInAs(user.user, b.org.id);
    expect(await sendMenuForApprovalAction({ menuSelectionId: selection.id })).toMatchObject({ ok: true, versionNumber: 1 });
  });

  it("the quote is refused after the menu has gone to the customer, through the action too", async () => {
    const b = await newBusiness();
    const { selection } = await customMenuOrder(b);
    signedInAs(b.owner.user, b.org.id);
    await setCustomMenuPriceAction(selection.id, 250);
    await sendMenuForApproval(b.org.id, { menuSelectionId: selection.id }, b.owner.user.id);
    const refused = await setCustomMenuPriceAction(selection.id, 999);
    expect(refused.ok).toBe(false);
    expect(refused.ok ? "" : refused.error).toMatch(/price can't change/i);
  });
});

describe("an approval-only user (menus: approve, no orders: edit)", () => {
  it("can use every approval action in its stage and cannot reach any order-save action", async () => {
    const b = await newBusiness();
    const { selection, order } = await b.makeOrder();
    const user = await approvalOnlyPerson(b);
    signedInAs(user.user, b.org.id);

    // planner: only in Needs Review (Decision 7)
    expect(await updateMenuApprovalMealPlanAction(selection.id, meal)).toEqual({ ok: true });
    expect(await addMenuApprovalNoteAction(selection.id, "Call the customer")).toEqual({ ok: true });
    expect(await sendMenuForApprovalAction({ menuSelectionId: selection.id })).toMatchObject({ ok: true });
    const frozen = await updateMenuApprovalMealPlanAction(selection.id, meal);
    expect(frozen.ok).toBe(false);
    expect(await recallMenuAction(selection.id)).toEqual({ ok: true });
    expect(await updateMenuApprovalMealPlanAction(selection.id, meal)).toEqual({ ok: true });
    expect(await changeMenuStatusAction(selection.id, "CUSTOMER_APPROVED", "agreed by phone")).toEqual({ ok: true });
    expect(await approveAndSendToKitchenAction(selection.id)).toEqual({ ok: true });

    // ...and never an order edit
    const refused = await updateOrderAction(order.id, new FormData()).catch((e) => e);
    expect(isForbidden(refused), String(refused)).toBe(true);
  });
});

describe("notes on a Completed order are refused on the server (Decision 15)", () => {
  it("refuses a note on a completed order, keeps the existing notes, and still allows one before", async () => {
    const b = await newBusiness();
    const { selection, order } = await b.makeOrder();
    signedInAs(b.owner.user, b.org.id);
    expect(await addMenuApprovalNoteAction(selection.id, "First note")).toEqual({ ok: true });
    await prisma.order.update({ where: { id: order.id }, data: { status: "COMPLETED" } });
    const refused = await addMenuApprovalNoteAction(selection.id, "Late note");
    expect(refused).toEqual({ ok: false, error: "This order is completed, so it can't be changed any more." });
    const notes = await prisma.menuApprovalNote.findMany({ where: { menuSelectionId: selection.id } });
    expect(notes.map((n) => n.body)).toEqual(["First note"]);
  });
});

describe("start menu approval", () => {
  it("creates the approval once for an order that has none, and asking again returns the same one", async () => {
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    await prisma.menuSelection.delete({ where: { id: selection.id } });
    const user = await approvalOnlyPerson(b);
    signedInAs(user.user, b.org.id);
    expect(await startMenuApprovalAction(order.id)).toEqual({ ok: true });
    expect(await startMenuApprovalAction(order.id)).toEqual({ ok: true });
    const created = await prisma.menuSelection.findMany({ where: { organizationId: b.org.id, event: { orderId: order.id } } });
    expect(created).toHaveLength(1);
    expect(created[0].status).toBe("DRAFT");
    expect(await prisma.menuVersion.count({ where: { menuSelectionId: created[0].id } })).toBe(0); // nothing was sent
  });

  it("two requests at once still create one approval", async () => {
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    await prisma.menuSelection.delete({ where: { id: selection.id } });
    signedInAs(b.owner.user, b.org.id);
    await Promise.all([startMenuApprovalAction(order.id), startMenuApprovalAction(order.id), startMenuApprovalAction(order.id)]);
    expect(await prisma.menuSelection.count({ where: { organizationId: b.org.id, event: { orderId: order.id } } })).toBe(1);
  });

  it("needs menus: approve, an Event Type, and an order that is not Completed or Cancelled", async () => {
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    await prisma.menuSelection.delete({ where: { id: selection.id } });
    const manager = await managerWithoutApproval(b);
    signedInAs(manager.user, b.org.id);
    expect(isForbidden(await startMenuApprovalAction(order.id).catch((e) => e))).toBe(true);

    signedInAs(b.owner.user, b.org.id);
    await prisma.order.update({ where: { id: order.id }, data: { eventTypeId: null } });
    const noType = await startMenuApprovalAction(order.id);
    expect(noType.ok ? "" : noType.error).toMatch(/Event Type/);
    await prisma.order.update({ where: { id: order.id }, data: { eventTypeId: b.eventType.id, status: "COMPLETED" } });
    expect((await startMenuApprovalAction(order.id)).ok).toBe(false);
    await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    expect((await startMenuApprovalAction(order.id)).ok).toBe(false);
    expect(await prisma.menuSelection.count({ where: { organizationId: b.org.id } })).toBe(0);
  });

  it("does not reach another business's order", async () => {
    const a = await newBusiness("A");
    const other = await newBusiness("B");
    const theirs = await other.makeOrder();
    await prisma.menuSelection.delete({ where: { id: theirs.selection.id } });
    signedInAs(a.owner.user, a.org.id);
    expect((await startMenuApprovalAction(theirs.order.id)).ok).toBe(false);
    expect(await prisma.menuSelection.count({ where: { organizationId: other.org.id } })).toBe(0);
    // and an outsider claiming the other business as active is shut out
    signedInAs(a.owner.user, other.org.id);
    expect(isForbidden(await startMenuApprovalAction(theirs.order.id).catch((e) => e))).toBe(true);
  });
});

describe("location isolation for a member held to one location", () => {
  async function twoLocations() {
    const b = await newBusiness("Loc Org");
    const plan = await prisma.subscriptionPlan.create({ data: { code: `p2-${crypto.randomUUID()}`, name: "P2", multiLocation: true } });
    await prisma.subscription.create({ data: { organizationId: b.org.id, subscriptionPlanId: plan.id, status: "ACTIVE", startDate: new Date() } });
    await prisma.organization.update({ where: { id: b.org.id }, data: { status: "ACTIVE" } });
    await setMultiLocationEnabled(b.org.id, true, b.owner.user.id);
    const north = await addLocation(b.org.id, "North", b.owner.user.id);
    const south = await addLocation(b.org.id, "South", b.owner.user.id);
    const held = await approvalOnlyPerson(b);
    await setMemberLocation(b.org.id, held.member.id, north.id, b.owner.user.id);
    const at = async (kitchenId: string) => {
      const made = await b.makeOrder();
      await prisma.event.updateMany({ where: { orderId: made.order.id }, data: { assignedKitchenId: kitchenId } });
      return made;
    };
    return { b, held, mine: await at(north.id), theirs: await at(south.id) };
  }

  it("is refused for the other location's order on every approval action, with nothing changed; works on their own", async () => {
    const w = await twoLocations();
    signedInAs(w.held.user, w.b.org.id);
    const id = w.theirs.selection.id;
    for (const call of [
      () => updateMenuApprovalMealPlanAction(id, meal),
      () => addMenuApprovalNoteAction(id, "hello"),
      () => sendMenuForApprovalAction({ menuSelectionId: id }),
      () => sendMenuForApprovalAction({ orderId: w.theirs.order.id }),
      () => recallMenuAction(id),
      () => approveAndSendToKitchenAction(id),
      () => changeMenuStatusAction(id, "CUSTOMER_APPROVED", "agreed by phone"),
      () => startMenuApprovalAction(w.theirs.order.id),
    ]) {
      expect(isNotFound(await call().catch((e) => e))).toBe(true);
    }
    const theirs = await prisma.menuSelection.findUniqueOrThrow({ where: { id }, include: { versions: true, notes: true } });
    expect([theirs.status, theirs.versions.length, theirs.notes.length]).toEqual(["DRAFT", 0, 0]);

    expect(await addMenuApprovalNoteAction(w.mine.selection.id, "mine")).toEqual({ ok: true });
    expect(await sendMenuForApprovalAction({ menuSelectionId: w.mine.selection.id })).toMatchObject({ ok: true });
  });
});
