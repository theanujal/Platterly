import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder } from "@/modules/orders/order";
import { createCustomer } from "@/modules/customers/customer";
import { createEventType } from "@/modules/events/event-type";
import { approveViaLink, sendMenuForApproval, recallMenuFromCustomer } from "@/modules/menu-approvals/approval-link";
import { disableShare, enableShare, getShareState, resolveShare, shareStatus } from "@/modules/orders/order-share";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.secureAccessToken.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menuVersionItem.deleteMany({ where: { menuVersion: { menuSelection: { organizationId: { in: cleanupOrgIds } } } } });
  await prisma.menuVersion.deleteMany({ where: { menuSelection: { organizationId: { in: cleanupOrgIds } } } });
  await prisma.menuSelectionItem.deleteMany({ where: { menuSelection: { organizationId: { in: cleanupOrgIds } } } });
  await prisma.menuSelection.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.eventType.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

const tokenOf = (url: string) => url.split("/")[url.split("/").length - 1];

/** An order whose menu has been sent and (optionally) approved by the customer. */
async function makeOrder({ approve = true } = {}) {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Share Test Kitchen", slug: `shr-${crypto.randomUUID().slice(0, 8)}`, contactPhone: "+919800011122", contactEmail: "kitchen@example.test", createdAt: new Date() },
  });
  cleanupOrgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Team", email: `team-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  cleanupUserIds.push(actor.id);
  const customer = await createCustomer(org.id, { name: "Anoop Jalota", phone: "9876543210", email: "anoop-secret@example.test" }, actor.id);
  const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
  const order = await createOrder(
    org.id,
    {
      customerId: customer.id,
      eventTypeId: eventType.id,
      eventStartDate: new Date("2026-12-05"),
      eventEndDate: new Date("2026-12-05"),
      venue: "Grand Hall",
      eventAddress: "12 MG Road",
      totalParticipants: 120,
      adultCount: 1,
      individualPricingEnabled: true,
      mealPlanEntries: [{ date: new Date("2026-12-05"), mealType: "DINNER", price: 5000 }],
    },
    actor.id,
  );
  const sent = await sendMenuForApproval(org.id, { orderId: order.id }, actor.id);
  if (approve) await approveViaLink(sent.url.split("/menu-approval/")[1]);
  return { org, actor, order, sent };
}

describe("Share order (AJ, 2026-10-12)", () => {
  it("cannot be shared before the customer approves the menu", async () => {
    const { org, order } = await makeOrder({ approve: false });
    expect((await getShareState(org.id, order.id)).allowed).toBe(false);
    expect(await enableShare(org.id, order.id)).toBeNull();
  });

  it("switching it on gives one link (the same one again), and the page shows the event, menu and kitchen contact", async () => {
    const { org, order } = await makeOrder();
    expect((await getShareState(org.id, order.id)).url).toBeNull();
    const url = await enableShare(org.id, order.id);
    expect(url).toContain("/share/");
    expect(await enableShare(org.id, order.id)).toBe(url);
    expect(await prisma.secureAccessToken.count({ where: { organizationId: org.id, resourceType: "ORDER_SHARE", revokedAt: null } })).toBe(1);

    const share = await resolveShare(tokenOf(url!), new Date("2026-10-12T06:00:00Z"));
    expect(share.ok && !share.ended).toBe(true);
    if (!share.ok || share.ended) return;
    expect(share.view).toMatchObject({
      hostName: "Anoop Jalota",
      eventType: "Wedding",
      guests: 120,
      venue: "Grand Hall, 12 MG Road",
      kitchen: { name: "Share Test Kitchen", phone: "+919800011122", email: "kitchen@example.test" },
      meals: [{ label: "Dinner", date: "2026-12-05" }],
      status: { label: "Menu approved" },
    });
  });

  it("shows no price, no customer phone and no customer email anywhere in what the page gets", async () => {
    const { org, order } = await makeOrder();
    const url = (await enableShare(org.id, order.id))!;
    const share = await resolveShare(tokenOf(url));
    const json = JSON.stringify(share);
    expect(json).not.toMatch(/price|total|amount|unitPrice/i);
    expect(json).not.toContain("9876543210");
    expect(json).not.toContain("anoop-secret@example.test");
  });

  it("stops working when the customer turns it off, and a new link is a new link", async () => {
    const { org, order } = await makeOrder();
    const first = (await enableShare(org.id, order.id))!;
    await disableShare(org.id, order.id);
    expect(await resolveShare(tokenOf(first))).toEqual({ ok: false });
    expect((await getShareState(org.id, order.id)).url).toBeNull();
    const second = (await enableShare(org.id, order.id))!;
    expect(second).not.toBe(first);
    expect((await resolveShare(tokenOf(second))).ok).toBe(true);
  });

  it("says the event has ended after its last day (India), and shows nothing else then", async () => {
    const { org, order } = await makeOrder();
    const token = tokenOf((await enableShare(org.id, order.id))!);
    // 5 Dec 2026: still on the day itself at 11 pm India time (17:30 UTC), over from midnight India (18:30 UTC).
    expect(await resolveShare(token, new Date("2026-12-05T17:30:00Z"))).toMatchObject({ ok: true, ended: false });
    const after = await resolveShare(token, new Date("2026-12-05T18:30:00Z"));
    expect(after).toMatchObject({ ok: true, ended: true });
    expect(JSON.stringify(after)).not.toContain("Wedding");
  });

  it("is unavailable for a cancelled order, a wrong token, and a menu taken back for editing", async () => {
    const { org, actor, order } = await makeOrder();
    const token = tokenOf((await enableShare(org.id, order.id))!);
    expect(await resolveShare("not-a-real-token")).toEqual({ ok: false });

    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { organizationId: org.id } });
    await recallMenuFromCustomer(org.id, selection.id, actor.id).catch(() => undefined);
    await prisma.menuSelection.update({ where: { id: selection.id }, data: { status: "DRAFT" } });
    expect(await resolveShare(token)).toEqual({ ok: false });
    await prisma.menuSelection.update({ where: { id: selection.id }, data: { status: "CUSTOMER_APPROVED" } });
    expect((await resolveShare(token)).ok).toBe(true);

    await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    expect(await resolveShare(token)).toEqual({ ok: false });
  });

  it("the one-line status follows the kitchen", () => {
    expect(shareStatus("CUSTOMER_APPROVED", "PENDING").label).toBe("Menu approved");
    expect(shareStatus("FINAL_LOCKED", "PENDING").label).toBe("With the kitchen");
    expect(shareStatus("FINAL_LOCKED", "IN_PREPARATION").label).toBe("Being prepared");
    expect(shareStatus("FINAL_LOCKED", "READY").label).toBe("Ready");
    expect(shareStatus("FINAL_LOCKED", "DELIVERED").label).toBe("Delivered");
  });
});
