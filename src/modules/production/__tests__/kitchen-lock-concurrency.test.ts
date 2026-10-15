import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInventoryItem } from "@/modules/inventory/inventory";
import { deleteOrder } from "@/modules/orders/order";
import { OrderLockedError } from "@/modules/orders/order-lock";
import { lockAndReadOrder } from "@/modules/orders/kitchen-lock";
import { sendOrderItems, StockTakeError } from "@/modules/production/production";
import { approveAndSendToKitchen, setKitchenProductionStatus } from "@/modules/menu-approvals/menu-approval";
import { changeStatusManually, ManualStatusChangeError } from "@/modules/menu-approvals/manual-status";
import { cleanupWorlds, newBusiness, orgIds } from "@/modules/menu-approvals/__tests__/phase2-world";

// Stock sending, kitchen-stage changes, manual moves and deletes take their locks in ONE order (the order's menu approvals, then the
// order row, then inventory; see `lockAndReadOrder`), and read the lock state only after holding them. These tests make the
// interleavings deterministic: a "holder" transaction owns the locks, the two operations under test are started one after the other
// (each confirmed to be waiting on a lock), and the holder lets go, so the lock queue decides who goes first.

afterEach(async () => {
  const inventory = await prisma.inventory.findMany({ where: { organizationId: { in: orgIds } }, select: { id: true } });
  const ids = inventory.map((i) => i.id);
  await prisma.payment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.eventRequiredInventory.deleteMany({ where: { inventoryId: { in: ids } } });
  await prisma.inventoryTransaction.deleteMany({ where: { inventoryId: { in: ids } } }).catch(() => undefined);
  await cleanupWorlds();
  await prisma.inventory.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
});

type Business = Awaited<ReturnType<typeof newBusiness>>;

/** An approved order (customer approved, order Approved) that needs 5 kg of Paneer, with 50 kg on the shelf. */
async function approvedOrderNeedingStock(b: Business) {
  const { order, selection } = await b.makeOrder();
  await prisma.menuSelection.update({ where: { id: selection.id }, data: { status: "CUSTOMER_APPROVED" } });
  await prisma.order.update({ where: { id: order.id }, data: { status: "APPROVED" } });
  const paneer = await createInventoryItem(b.org.id, { name: "Paneer", category: "Dairy", unit: "kg" }, b.owner.user.id, 50);
  const event = await prisma.event.findFirstOrThrow({ where: { orderId: order.id } });
  await prisma.eventRequiredInventory.create({ data: { eventId: event.id, inventoryId: paneer.id, quantity: 5 } });
  return { order, selection, paneer };
}

const stockOf = async (id: string) => Number((await prisma.inventory.findUniqueOrThrow({ where: { id } })).stockCount);
const movements = (orderId: string, type: "STOCK_OUT" | "STOCK_IN") => prisma.inventoryTransaction.count({ where: { orderId, type } });

async function waiting(): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
  return rows[0].n;
}
async function untilWaiting(atLeast: number) {
  for (let i = 0; i < 200; i++) {
    if ((await waiting()) >= atLeast) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("The operation never reached its lock wait.");
}

type Settled = { ok: true; value: unknown } | { ok: false; error: unknown };
const settle = (promise: Promise<unknown>): Promise<Settled> => promise.then((value) => ({ ok: true as const, value }), (error) => ({ ok: false as const, error }));

/** Holds the order's locks, starts `first` then `second` (each queued behind the holder, in that order), then lets go. */
async function race(b: Business, orderId: string, first: () => Promise<unknown>, second: () => Promise<unknown>): Promise<[Settled, Settled]> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let held!: () => void;
  const holding = new Promise<void>((resolve) => (held = resolve));
  const holder = prisma.$transaction(
    async (tx) => {
      await lockAndReadOrder(tx, b.org.id, orderId, { alsoLockOrder: true });
      held();
      await gate;
    },
    { timeout: 60_000 },
  );
  await holding;
  const base = await waiting();
  const one = settle(first());
  await untilWaiting(base + 1);
  const two = settle(second());
  await untilWaiting(base + 2);
  release();
  await holder;
  return [await one, await two];
}

describe("stock send vs the kitchen lock", () => {
  it("a send that goes first wins: the move-back is refused and the order stays with the kitchen", async () => {
    const b = await newBusiness();
    const { order, selection, paneer } = await approvedOrderNeedingStock(b);
    // Hand-off first (the order is now Sent to Kitchen with the stage at Pending and nothing recorded: a move-back would be allowed).
    await prisma.menuSelection.update({ where: { id: selection.id }, data: { status: "FINAL_LOCKED", kitchenProductionStatus: "PENDING", lockedAt: new Date() } });
    await prisma.order.update({ where: { id: order.id }, data: { status: "SENT_TO_KITCHEN" } });

    const [send, back] = await race(
      b,
      order.id,
      () => sendOrderItems(b.org.id, order.id, b.owner.user.id),
      () => changeStatusManually(b.org.id, { orderId: order.id, target: { kind: "ORDER", status: "PENDING_REVIEW" }, reason: "Sent by mistake", actorUserId: b.owner.user.id }),
    );
    expect(send.ok).toBe(true);
    expect(back.ok).toBe(false);
    expect(!back.ok && back.error).toBeInstanceOf(ManualStatusChangeError);
    const after = await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } });
    expect([after.status, (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status]).toEqual(["FINAL_LOCKED", "SENT_TO_KITCHEN"]);
    expect(await stockOf(paneer.id)).toBe(45);
    expect(await movements(order.id, "STOCK_OUT")).toBe(1);
  });

  it("a move-back that goes first wins: the send is refused and no stock leaves the shelf", async () => {
    const b = await newBusiness();
    const { order, selection, paneer } = await approvedOrderNeedingStock(b);
    await prisma.menuSelection.update({ where: { id: selection.id }, data: { status: "FINAL_LOCKED", kitchenProductionStatus: "PENDING", lockedAt: new Date() } });
    await prisma.order.update({ where: { id: order.id }, data: { status: "SENT_TO_KITCHEN" } });

    const [back, send] = await race(
      b,
      order.id,
      () => changeStatusManually(b.org.id, { orderId: order.id, target: { kind: "ORDER", status: "PENDING_REVIEW" }, reason: "Sent by mistake", actorUserId: b.owner.user.id }),
      () => sendOrderItems(b.org.id, order.id, b.owner.user.id),
    );
    expect(back.ok).toBe(true);
    expect(send.ok).toBe(false);
    expect(!send.ok && send.error).toBeInstanceOf(StockTakeError);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_REVIEW");
    expect(await stockOf(paneer.id)).toBe(50);
    expect(await movements(order.id, "STOCK_OUT")).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).stockDeductedAt).toBeNull();
  });

  it("a send that goes first beats a kitchen stage change too, and neither leaves a half state", async () => {
    const b = await newBusiness();
    const { order, selection, paneer } = await approvedOrderNeedingStock(b);
    await prisma.menuSelection.update({ where: { id: selection.id }, data: { status: "FINAL_LOCKED", kitchenProductionStatus: "PENDING", lockedAt: new Date() } });
    await prisma.order.update({ where: { id: order.id }, data: { status: "SENT_TO_KITCHEN" } });
    const [send, stage] = await race(
      b,
      order.id,
      () => sendOrderItems(b.org.id, order.id, b.owner.user.id),
      () => setKitchenProductionStatus(b.org.id, selection.id, "CANCELLED", b.owner.user.id),
    );
    expect(send.ok && stage.ok).toBe(true);
    // The cancel came second, saw the order with its stock sent, and its after-commit return put the stock back: shelf whole again.
    expect(await stockOf(paneer.id)).toBe(50);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CANCELLED");
  });
});

describe("delete vs the hand-off, and delete vs stock return", () => {
  it("a delete that goes first wins: stock comes back, the order is gone, the hand-off finds nothing", async () => {
    const b = await newBusiness();
    const { order, selection, paneer } = await approvedOrderNeedingStock(b);
    await sendOrderItems(b.org.id, order.id, b.owner.user.id);
    expect(await stockOf(paneer.id)).toBe(45);
    const [del, handoff] = await race(
      b,
      order.id,
      () => deleteOrder(b.org.id, order.id, b.owner.user.id),
      () => approveAndSendToKitchen(b.org.id, selection.id, b.owner.user.id),
    );
    expect(del.ok).toBe(true);
    expect(handoff.ok).toBe(false);
    expect(await prisma.order.count({ where: { id: order.id } })).toBe(0);
    expect(await stockOf(paneer.id)).toBe(50);
  });

  it("a hand-off that goes first wins: the delete is refused and the order and its stock are untouched", async () => {
    const b = await newBusiness();
    const { order, selection, paneer } = await approvedOrderNeedingStock(b);
    await sendOrderItems(b.org.id, order.id, b.owner.user.id);
    const [handoff, del] = await race(
      b,
      order.id,
      () => approveAndSendToKitchen(b.org.id, selection.id, b.owner.user.id),
      () => deleteOrder(b.org.id, order.id, b.owner.user.id),
    );
    expect(handoff.ok).toBe(true);
    expect(del.ok).toBe(false);
    expect(!del.ok && del.error).toBeInstanceOf(OrderLockedError);
    expect(await prisma.order.count({ where: { id: order.id } })).toBe(1);
    expect(await stockOf(paneer.id)).toBe(45);
    expect(await movements(order.id, "STOCK_IN")).toBe(0); // nothing was returned by the refused delete
  });

  it("a delete that fails after the stock return rolls the return back (the order has a payment, which blocks the delete)", async () => {
    const b = await newBusiness();
    const { order, paneer } = await approvedOrderNeedingStock(b);
    await sendOrderItems(b.org.id, order.id, b.owner.user.id);
    await prisma.payment.create({ data: { organizationId: b.org.id, orderId: order.id, amount: 100, type: "ADVANCE", method: "CASH" } });
    const failed = await settle(deleteOrder(b.org.id, order.id, b.owner.user.id));
    expect(failed.ok).toBe(false);
    expect(await prisma.order.count({ where: { id: order.id } })).toBe(1);
    expect(await stockOf(paneer.id)).toBe(45); // still out: the return did not survive the failed delete
    expect(await movements(order.id, "STOCK_IN")).toBe(0);
    expect(await movements(order.id, "STOCK_OUT")).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).stockDeductedAt).not.toBeNull();
  });
});

describe("no deadlock, no invalid state, when everything runs at once", () => {
  it.each([1, 2, 3, 4, 5, 6])("send, move-back, stage change and delete together (run %i)", async () => {
    const b = await newBusiness();
    const { order, selection, paneer } = await approvedOrderNeedingStock(b);
    await prisma.menuSelection.update({ where: { id: selection.id }, data: { status: "FINAL_LOCKED", kitchenProductionStatus: "PENDING", lockedAt: new Date() } });
    await prisma.order.update({ where: { id: order.id }, data: { status: "SENT_TO_KITCHEN" } });

    const results = await Promise.all([
      settle(sendOrderItems(b.org.id, order.id, b.owner.user.id)),
      settle(changeStatusManually(b.org.id, { orderId: order.id, target: { kind: "ORDER", status: "PENDING_REVIEW" }, reason: "Sent by mistake", actorUserId: b.owner.user.id })),
      settle(setKitchenProductionStatus(b.org.id, selection.id, "IN_PREPARATION", b.owner.user.id)),
      settle(deleteOrder(b.org.id, order.id, b.owner.user.id)),
    ]);
    for (const r of results) if (!r.ok) expect(String((r.error as Error)?.message ?? r.error)).not.toMatch(/deadlock|could not serialize/i);

    const row = await prisma.order.findUnique({ where: { id: order.id } });
    const out = await movements(order.id, "STOCK_OUT");
    const back = await prisma.inventoryTransaction.count({ where: { orderId: order.id, type: "STOCK_IN" } });
    if (row) {
      // The order survived: if it was moved back (its approval no longer Final/Locked) no stock may have been sent to it.
      const sel = await prisma.menuSelection.findFirst({ where: { id: selection.id } });
      if (sel && sel.status !== "FINAL_LOCKED") expect(out).toBe(0);
      expect(await stockOf(paneer.id)).toBe(50 - 5 * (out - back));
    } else {
      expect(await stockOf(paneer.id)).toBe(50); // deleted: everything that was sent came back
    }
  });
});
