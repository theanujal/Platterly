import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { sendMenuForApproval, approveViaLink } from "@/modules/menu-approvals/approval-link";
import { approvedOrderEmailDetails, orderDetailsLine, venueLines } from "@/modules/notifications/approved-order-details";
import { orderStatusEmail } from "@/lib/notifications/email/templates";
import { cleanupWorlds, newBusiness } from "@/modules/menu-approvals/__tests__/phase2-world";

afterEach(async () => {
  await prisma.notificationLog.deleteMany({ where: { notification: { organizationId: { in: (await prisma.organization.findMany({ where: { name: "P2 Org" }, select: { id: true } })).map((o) => o.id) } } } }).catch(() => undefined);
  await cleanupWorlds();
});

describe("the order summary line", () => {
  it("lists adults and each child band, the way the customer's page does", () => {
    expect(orderDetailsLine({ eventType: "Birthday", dateText: "9 Nov 2026", guests: 50, adults: 40, childBelow5: 3, child5To10: 7 })).toBe("Birthday · 9 Nov 2026 · 50 Guests (40 adults · 3 under 5 · 7 aged 5–10)");
    expect(orderDetailsLine({ eventType: null, dateText: "9 Nov 2026", guests: 1, adults: 1, childBelow5: 0, child5To10: 0 })).toBe("9 Nov 2026 · 1 Guest");
  });

  it("builds a venue as place, address, landmark and contact, and drops what is empty", () => {
    expect(venueLines({ venueType: null, venue: "Green Meadows", venueDoorNumber: "12", venueTower: null, venueFloor: "4", eventAddress: "MG Road", venueLandmark: "Metro", venueContactName: "Rohit", venueContactPhone: "98765" })).toEqual(["Green Meadows", "12, 4, MG Road", "Landmark: Metro", "Contact: Rohit · 98765"]);
    expect(venueLines({ venueType: null, venue: null, venueDoorNumber: null, venueTower: null, venueFloor: null, eventAddress: null, venueLandmark: null, venueContactName: null, venueContactPhone: null })).toEqual([]);
  });
});

describe("the approved-order email data", () => {
  it("is empty until the customer has approved, then carries the menu, status link, prices, share link, QR picture and kitchen contact", async () => {
    const b = await newBusiness();
    await prisma.organization.update({ where: { id: b.org.id }, data: { contactPhone: "+919876500000", contactEmail: "hello@kitchen.test", addressLine1: "21 Church Street", city: "Bangalore" } });
    const { order, selection } = await b.makeOrder();
    expect(await approvedOrderEmailDetails(b.org.id, order.id)).toBeNull(); // nothing approved yet

    const sent = await sendMenuForApproval(b.org.id, { menuSelectionId: selection.id }, b.owner.user.id);
    expect(await approveViaLink(sent.url.split("/").pop()!)).toEqual({ ok: true });

    const data = (await approvedOrderEmailDetails(b.org.id, order.id))!;
    expect(data.statusUrl).toContain(`/menu-approval/${sent.url.split("/").pop()}`);
    expect(data.orderDetails).toMatch(/Wedding · .* · 120 Guests/);
    expect(data.venue).toBeNull(); // the venue form comes after the approval
    expect(data.total).toBeGreaterThan(0);
    expect(data.priceRows.length).toBeGreaterThan(0);
    expect(data.shareUrl).toMatch(/\/share\/[\w-]+$/);
    expect(data.shareQrUrl).toBe(`${data.shareUrl}/qr`);
    expect(data.kitchen).toEqual({ name: "P2 Org", phone: "+919876500000", email: "hello@kitchen.test", address: "21 Church Street, Bangalore" });

    // The email shows every section the customer asked for.
    const { html, subject } = orderStatusEmail({ status: "APPROVED", customerName: "Anoop", orderNumber: "ORD-1", approved: data });
    expect(subject).toBe("Your Catering Order is Confirmed");
    for (const text of ["Order ID", "ORD-1", "Selected Menu", "Order Details", "Order Status URL", "Venue Details", "Pricing Summary", "Grand Total", "Want to share with family &amp; team?", "Share link", "Share menu QR", data.shareQrUrl!, "Need to make changes?", "please contact our team", "hello@kitchen.test", "+919876500000"]) {
      expect(html.toLowerCase()).toContain(text.toLowerCase());
    }
  });
});

describe("the share QR picture", () => {
  it("serves a PNG for a live share token and a plain 404 for anything else", async () => {
    const { GET } = await import("@/app/share/[token]/qr/route");
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    const sent = await sendMenuForApproval(b.org.id, { menuSelectionId: selection.id }, b.owner.user.id);
    await approveViaLink(sent.url.split("/").pop()!);
    const data = (await approvedOrderEmailDetails(b.org.id, order.id))!;
    const token = data.shareUrl!.split("/").pop()!;
    const ok = await GET(new Request("http://x.test"), { params: Promise.resolve({ token }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await ok.arrayBuffer()).slice(1, 4)).toEqual(new Uint8Array([0x50, 0x4e, 0x47])); // "PNG"
    expect((await GET(new Request("http://x.test"), { params: Promise.resolve({ token: "nope" }) })).status).toBe(404);
  });
});
