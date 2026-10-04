import { describe, it, expect, afterEach, vi } from "vitest";

// The real Server Actions, called the way a hand-made request would: signed in as a given person, with another
// location's id. Sign-in and permission checks are stubbed (they are tested elsewhere); the location check is real.
const who = vi.hoisted(() => ({ organizationId: "", userId: "" }));
vi.mock("@/lib/auth/require-session", () => ({
  requireActiveOrganization: async () => ({ session: { user: { id: who.userId } }, organizationId: who.organizationId }),
  requirePermission: async () => undefined,
  hasPermission: async () => true,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

import { prisma } from "@/lib/db";
import { deleteOrderAction, updateEventOperationsAction, changeOrderStatusAction } from "@/app/(app)/orders/actions";
import { deleteInventoryItemAction, recordStockTransactionAction } from "@/app/(app)/inventory/actions";
import { markOrderedAction } from "@/app/(app)/purchasing/actions";
import { setKitchenProductionStatusAction } from "@/app/(app)/kitchen-dashboard/actions";
import { addLocation, setMultiLocationEnabled } from "../locations";
import { setMemberLocation } from "@/modules/team/team";

const orgIds: string[] = [];
const userIds: string[] = [];
const planIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
  orgIds.length = userIds.length = planIds.length = 0;
});

async function world() {
  const plan = await prisma.subscriptionPlan.create({ data: { code: `ag-${crypto.randomUUID()}`, name: "AG", multiLocation: true } });
  planIds.push(plan.id);
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "AG Co", slug: `ag-${crypto.randomUUID().slice(0, 8)}`, status: "ACTIVE", createdAt: new Date() } });
  orgIds.push(org.id);
  await prisma.subscription.create({ data: { organizationId: org.id, subscriptionPlanId: plan.id, status: "ACTIVE", startDate: new Date() } });
  const person = async (role: string) => {
    const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: role, email: `${role}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
    userIds.push(user.id);
    const member = await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: user.id, role, createdAt: new Date() } });
    return { user, member };
  };
  const owner = await person("owner");
  const held = await person("manager");
  await setMultiLocationEnabled(org.id, true, owner.user.id);
  const north = await addLocation(org.id, "North", owner.user.id);
  const south = await addLocation(org.id, "South", owner.user.id);
  await setMemberLocation(org.id, held.member.id, north.id, owner.user.id);
  const customer = await prisma.customer.create({ data: { organizationId: org.id, name: "Asha", phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}` } });
  const eventType = await prisma.eventType.create({ data: { organizationId: org.id, name: "Wedding" } });
  const supplier = await prisma.supplier.create({ data: { organizationId: org.id, name: "Fresh Mart" } });
  let n = 0;
  const at = async (kitchenId: string) => {
    n += 1;
    const order = await prisma.order.create({ data: { organizationId: org.id, customerId: customer.id, eventTypeId: eventType.id, eventStartDate: new Date("2026-12-01"), eventEndDate: new Date("2026-12-01") } });
    const event = await prisma.event.create({ data: { organizationId: org.id, customerId: customer.id, eventTypeId: eventType.id, name: "E", startDate: new Date("2026-12-01"), endDate: new Date("2026-12-01"), orderId: order.id, assignedKitchenId: kitchenId } });
    const selection = await prisma.menuSelection.create({ data: { organizationId: org.id, eventId: event.id, status: "FINAL_LOCKED" } });
    const item = await prisma.inventory.create({ data: { organizationId: org.id, name: `Item ${n}`, category: "Spices", unit: "kg", kitchenId } });
    const po = await prisma.purchaseOrder.create({ data: { organizationId: org.id, number: `PO-${n}`, supplierId: supplier.id, kitchenId } });
    return { order, event, selection, item, po };
  };
  return { org, owner, held, north, south, mine: await at(north.id), theirs: await at(south.id) };
}

describe("Server Actions refuse another location's records (Chunk 23)", () => {
  it("a held member's hand-made calls with the other location's ids are refused and change nothing", async () => {
    const w = await world();
    who.organizationId = w.org.id;
    who.userId = w.held.user.id;

    await expect(deleteOrderAction(w.theirs.order.id)).rejects.toThrow();
    await expect(changeOrderStatusAction(w.theirs.order.id, "CANCELLED", "no")).rejects.toThrow();
    await expect(updateEventOperationsAction(w.theirs.order.id, w.theirs.event.id, { assignedKitchenId: w.north.id })).rejects.toThrow();
    await expect(deleteInventoryItemAction(w.theirs.item.id)).rejects.toThrow();
    await expect(recordStockTransactionAction(w.theirs.item.id, new FormData())).rejects.toThrow();
    await expect(markOrderedAction(w.theirs.po.id)).rejects.toThrow();
    await expect(setKitchenProductionStatusAction(w.theirs.selection.id, "READY")).rejects.toThrow();

    expect(await prisma.order.count({ where: { id: w.theirs.order.id } })).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: w.theirs.order.id } })).status).not.toBe("CANCELLED");
    expect((await prisma.event.findUniqueOrThrow({ where: { id: w.theirs.event.id } })).assignedKitchenId).toBe(w.south.id);
    expect(await prisma.inventory.count({ where: { id: w.theirs.item.id } })).toBe(1);
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: w.theirs.po.id } })).status).toBe("DRAFT");
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: w.theirs.selection.id } })).kitchenProductionStatus).toBe("PENDING");
  });

  it("the same calls on their own location's records go through, but an event cannot be moved away", async () => {
    const w = await world();
    who.organizationId = w.org.id;
    who.userId = w.held.user.id;

    expect(await changeOrderStatusAction(w.mine.order.id, "CANCELLED", "customer asked")).toMatchObject({ ok: true });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: w.mine.order.id } })).status).toBe("CANCELLED");
    expect(await setKitchenProductionStatusAction(w.mine.selection.id, "READY")).toMatchObject({ ok: true });
    await expect(updateEventOperationsAction(w.mine.order.id, w.mine.event.id, { assignedKitchenId: w.south.id })).rejects.toThrow();
    expect((await prisma.event.findUniqueOrThrow({ where: { id: w.mine.event.id } })).assignedKitchenId).toBe(w.north.id);
    expect(await deleteInventoryItemAction(w.mine.item.id)).toMatchObject({ ok: true });
  });

  it("the owner is never held: the same call on the other location's order goes through", async () => {
    const w = await world();
    who.organizationId = w.org.id;
    who.userId = w.owner.user.id;
    expect(await changeOrderStatusAction(w.theirs.order.id, "CANCELLED", "owner decision")).toMatchObject({ ok: true });
  });
});
