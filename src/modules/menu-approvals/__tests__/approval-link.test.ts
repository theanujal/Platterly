import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder, getOrder } from "@/modules/orders/order";
import { createCustomer } from "@/modules/customers/customer";
import { createEventType } from "@/modules/events/event-type";
import { issueToken } from "@/lib/secure-access/token";
import {
  sendMenuForApproval,
  resolveApprovalLink,
  approveViaLink,
  requestChangesViaLink,
  recallMenuFromCustomer,
  getActiveApprovalUrl,
  getOrderMenuApproval,
} from "@/modules/menu-approvals/approval-link";
import { setMenuSelectionItems, InvalidMenuSelectionTransitionError } from "@/modules/menu-approvals/menu-approval";
import { createMenuItem } from "@/modules/menus/item";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menuVersionItem.deleteMany({ where: { menuVersion: { menuSelection: { organizationId: { in: cleanupOrgIds } } } } });
  await prisma.menuVersion.deleteMany({ where: { menuSelection: { organizationId: { in: cleanupOrgIds } } } });
  await prisma.menuSelectionItem.deleteMany({ where: { menuSelection: { organizationId: { in: cleanupOrgIds } } } });
  await prisma.menuSelection.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
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
    data: { id: crypto.randomUUID(), name: "Approval Test Org", slug: `appr-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
  });
  cleanupOrgIds.push(org.id);
  return org;
}

async function makeActor() {
  const actor = await prisma.user.create({
    data: { id: crypto.randomUUID(), name: "Team", email: `team-${crypto.randomUUID()}@example.test`, emailVerified: true },
  });
  cleanupUserIds.push(actor.id);
  return actor;
}

/** An admin-created Order: no Event and no MenuSelection yet — exactly what "Send Menu for Approval" has to cope with. */
async function makeAdminOrder(withEventType = true) {
  const org = await makeOrg();
  const actor = await makeActor();
  const customer = await createCustomer(org.id, { name: "Anoop Jalota", phone: "9876543210", email: "anoop@example.test" }, actor.id);
  const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
  const order = await createOrder(
    org.id,
    {
      customerId: customer.id,
      eventTypeId: withEventType ? eventType.id : null,
      eventStartDate: new Date("2026-12-05"),
      eventEndDate: new Date("2026-12-05"),
      totalParticipants: 120,
      individualPricingEnabled: true,
      mealPlanEntries: [{ date: new Date("2026-12-05"), mealType: "DINNER", price: 5000 }],
    },
    actor.id,
  );
  return { org, actor, customer, order };
}

const orderStatus = async (id: string) => (await prisma.order.findUniqueOrThrow({ where: { id } })).status;
const tokenOf = (url: string) => url.split("/menu-approval/")[1];

describe("sendMenuForApproval", () => {
  it("creates the Event + MenuSelection for an order that has none and sends version 1 with a frozen snapshot", async () => {
    const { org, actor, order } = await makeAdminOrder();
    expect(await prisma.menuSelection.count({ where: { organizationId: org.id } })).toBe(0);

    const sent = await sendMenuForApproval(org.id, { orderId: order.id }, actor.id);

    expect(sent.versionNumber).toBe(1);
    expect(sent.url).toContain("/menu-approval/");
    expect(await orderStatus(order.id)).toBe("AWAITING_CUSTOMER_APPROVAL");

    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { organizationId: org.id }, include: { event: true } });
    expect(selection.status).toBe("SENT_TO_CUSTOMER");
    expect(selection.event.orderId).toBe(order.id);
    expect(selection.currentVersion).toBe(1);

    const version = await prisma.menuVersion.findFirstOrThrow({ where: { menuSelectionId: selection.id } });
    expect(version.sentAt).not.toBeNull();
    expect(version.supersededAt).toBeNull();
    expect(version.snapshot).toMatchObject({
      customerName: "Anoop Jalota",
      eventTypeName: "Wedding",
      guests: 120,
      total: Number((await getOrder(org.id, order.id))!.total),
      meals: [{ date: "2026-12-05", mealType: "DINNER" }],
    });

    // "Sends email to customer" is log-only until a provider is wired (Chunk 16) — but it is logged, with the link.
    const notification = await prisma.notification.findFirstOrThrow({ where: { organizationId: org.id, event: "menu_approval.sent" } });
    expect(notification.channel).toBe("EMAIL");
    expect(notification.recipientEmail).toBe("anoop@example.test");
    expect(JSON.stringify(notification.payload)).toContain(sent.url);
  });

  it("refuses an order with no Event Type, with a message staff can act on", async () => {
    const { org, actor, order } = await makeAdminOrder(false);
    await expect(sendMenuForApproval(org.id, { orderId: order.id }, actor.id)).rejects.toThrow(/Event Type/);
  });

  it("can't send a menu that's already with the customer, or one they've already approved", async () => {
    const { org, actor, order } = await makeAdminOrder();
    const sent = await sendMenuForApproval(org.id, { orderId: order.id }, actor.id);
    await expect(sendMenuForApproval(org.id, { orderId: order.id }, actor.id)).rejects.toThrow(/already with the customer/);

    await approveViaLink(tokenOf(sent.url));
    await expect(sendMenuForApproval(org.id, { orderId: order.id }, actor.id)).rejects.toThrow(/already been approved/);
  });

  it("sends an updated version after changes are requested: v2 supersedes v1 and v1's link dies", async () => {
    const { org, actor, order } = await makeAdminOrder();
    const v1 = await sendMenuForApproval(org.id, { orderId: order.id }, actor.id);
    await requestChangesViaLink(tokenOf(v1.url), "Replace Paneer Tikka with Malai Tikka.");
    expect(await orderStatus(order.id)).toBe("PENDING_REVIEW");

    const v2 = await sendMenuForApproval(org.id, { orderId: order.id }, actor.id);
    expect(v2.versionNumber).toBe(2);

    const versions = await prisma.menuVersion.findMany({ orderBy: { versionNumber: "asc" }, where: { menuSelection: { organizationId: org.id } } });
    expect(versions.map((v) => [v.versionNumber, v.supersededAt !== null])).toEqual([[1, true], [2, false]]);

    // The important one: an old email can never approve an outdated menu.
    expect(await approveViaLink(tokenOf(v1.url))).toEqual({ ok: false });
    expect(await orderStatus(order.id)).toBe("AWAITING_CUSTOMER_APPROVAL");
    expect(await approveViaLink(tokenOf(v2.url))).toEqual({ ok: true });
    expect(await orderStatus(order.id)).toBe("KITCHEN_REVIEW");
  });

  it("blocks item edits while a version is out, and copies the picked items onto the version", async () => {
    const { org, actor, order } = await makeAdminOrder();
    const paneer = await createMenuItem(org.id, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 150 }, actor.id);
    const first = await sendMenuForApproval(org.id, { orderId: order.id }, actor.id);
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { organizationId: org.id } });
    await expect(setMenuSelectionItems(org.id, selection.id, [{ itemType: "MENU_ITEM", catalogId: paneer.id }])).rejects.toThrow(InvalidMenuSelectionTransitionError);

    await recallMenuFromCustomer(org.id, selection.id, actor.id);
    await setMenuSelectionItems(org.id, selection.id, [{ itemType: "MENU_ITEM", catalogId: paneer.id }]);
    const second = await sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id);

    const v2 = await prisma.menuVersion.findFirstOrThrow({ where: { menuSelectionId: selection.id, versionNumber: 2 }, include: { items: true } });
    expect(v2.items.map((i) => i.name)).toEqual(["Paneer Tikka"]);
    expect(v2.snapshot).toMatchObject({ selectedItems: [{ name: "Paneer Tikka", isExtra: false }] });
    expect(first.versionNumber).toBe(1);
    expect(second.versionNumber).toBe(2);
  });
});

describe("resolveApprovalLink (public, no login)", () => {
  it("resolves a live link to exactly the frozen version it was sent for", async () => {
    const { org, actor, order } = await makeAdminOrder();
    const sent = await sendMenuForApproval(org.id, { orderId: order.id }, actor.id);

    const link = await resolveApprovalLink(tokenOf(sent.url));
    expect(link).toMatchObject({ ok: true, organizationId: org.id, organizationName: "Approval Test Org", versionNumber: 1, versionId: sent.versionId });
    expect(link.ok && link.snapshot.customerName).toBe("Anoop Jalota");
  });

  it("returns the same bare { ok: false } for every kind of dead link — nothing to probe", async () => {
    const { org, actor, order } = await makeAdminOrder();
    const sent = await sendMenuForApproval(org.id, { orderId: order.id }, actor.id);
    const token = tokenOf(sent.url);

    // Unknown / malformed.
    expect(await resolveApprovalLink("not-a-real-token")).toEqual({ ok: false });
    expect(await resolveApprovalLink("")).toEqual({ ok: false });

    // A real token of another resource type must never be accepted as a menu approval.
    const quoteToken = await issueToken({ organizationId: org.id, resourceType: "QUOTATION", resourceId: sent.versionId });
    expect(await resolveApprovalLink(quoteToken.token)).toEqual({ ok: false });

    // Expired.
    await prisma.secureAccessToken.updateMany({ where: { token }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resolveApprovalLink(token)).toEqual({ ok: false });
    await prisma.secureAccessToken.updateMany({ where: { token }, data: { expiresAt: new Date(Date.now() + 86_400_000) } });
    expect(await resolveApprovalLink(token)).toMatchObject({ ok: true });

    // Revoked.
    await prisma.secureAccessToken.updateMany({ where: { token }, data: { revokedAt: new Date() } });
    expect(await resolveApprovalLink(token)).toEqual({ ok: false });
  });

  it("issues links that expire after 14 days", async () => {
    const { org, actor, order } = await makeAdminOrder();
    const sent = await sendMenuForApproval(org.id, { orderId: order.id }, actor.id);
    const row = await prisma.secureAccessToken.findUniqueOrThrow({ where: { token: tokenOf(sent.url) } });
    const days = (row.expiresAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
    expect(row.resourceType).toBe("MENU_APPROVAL");
    expect(row.resourceId).toBe(sent.versionId);
  });

  it("stops working once the customer has responded", async () => {
    const { org, actor, order } = await makeAdminOrder();
    const sent = await sendMenuForApproval(org.id, { orderId: order.id }, actor.id);
    const token = tokenOf(sent.url);

    expect(await approveViaLink(token)).toEqual({ ok: true });
    expect(await resolveApprovalLink(token)).toEqual({ ok: false });
    expect(await approveViaLink(token)).toEqual({ ok: false }); // a second click / replayed email is a harmless no-op
    expect(await requestChangesViaLink(token, "too late")).toEqual({ ok: false });
  });

  it("stops working when the team recalls the menu", async () => {
    const { org, actor, order } = await makeAdminOrder();
    const sent = await sendMenuForApproval(org.id, { orderId: order.id }, actor.id);
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { organizationId: org.id } });

    await recallMenuFromCustomer(org.id, selection.id, actor.id);
    expect(await resolveApprovalLink(tokenOf(sent.url))).toEqual({ ok: false });
    expect(await orderStatus(order.id)).toBe("PENDING_REVIEW");
    expect(await getActiveApprovalUrl(org.id, selection.id)).toBeNull();
  });
});

describe("customer responses via the link", () => {
  it("Approve Menu: order -> Kitchen Review, and the customer's own approval is recorded with the version", async () => {
    const { org, actor, order } = await makeAdminOrder();
    const sent = await sendMenuForApproval(org.id, { orderId: order.id }, actor.id);

    expect(await approveViaLink(tokenOf(sent.url))).toEqual({ ok: true });

    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(selection.status).toBe("KITCHEN_REVIEWING");
    expect(await orderStatus(order.id)).toBe("KITCHEN_REVIEW");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: org.id, action: "menu_selection.customer_approved_via_link" } });
    expect(audit.after).toMatchObject({ versionNumber: 1 });
  });

  it("Request Changes: keeps the note, moves the order back to Pending Review and notifies the team", async () => {
    const { org, actor, order } = await makeAdminOrder();
    const sent = await sendMenuForApproval(org.id, { orderId: order.id }, actor.id);

    expect(await requestChangesViaLink(tokenOf(sent.url), "Replace Paneer Tikka with Malai Tikka.")).toEqual({ ok: true });

    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(selection.status).toBe("CHANGES_REQUESTED");
    expect(selection.customerRequestNote).toBe("Replace Paneer Tikka with Malai Tikka.");
    expect(await orderStatus(order.id)).toBe("PENDING_REVIEW");
    const notification = await prisma.notification.findFirstOrThrow({ where: { organizationId: org.id, event: "menu_approval.changes_requested" } });
    expect(JSON.stringify(notification.payload)).toContain("Malai Tikka");
  });
});

describe("staff lookups", () => {
  it("getOrderMenuApproval reports the workflow state and the live link for the Order page", async () => {
    const { org, actor, order } = await makeAdminOrder();
    expect(await getOrderMenuApproval(org.id, order.id)).toBeNull();

    const sent = await sendMenuForApproval(org.id, { orderId: order.id }, actor.id);
    const approval = await getOrderMenuApproval(org.id, order.id);
    expect(approval).toMatchObject({ status: "SENT_TO_CUSTOMER", currentVersion: 1, versionCount: 1, approvalUrl: sent.url });
  });

  it("is tenant-isolated: another org can neither see the link nor the menu approval", async () => {
    const { org, actor, order } = await makeAdminOrder();
    await sendMenuForApproval(org.id, { orderId: order.id }, actor.id);
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { organizationId: org.id } });
    const other = await makeOrg();

    expect(await getOrderMenuApproval(other.id, order.id)).toBeNull();
    expect(await getActiveApprovalUrl(other.id, selection.id)).toBeNull();
    await expect(sendMenuForApproval(other.id, { menuSelectionId: selection.id }, actor.id)).rejects.toThrow();
    await expect(recallMenuFromCustomer(other.id, selection.id, actor.id)).rejects.toThrow();
  });
});
