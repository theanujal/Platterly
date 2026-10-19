import "server-only";
import { prisma } from "@/lib/db";
import { canonicalUrl } from "@/lib/seo/canonical";
import { enableShare } from "@/modules/orders/order-share";
import { buildApprovalView, formatApprovalDay } from "@/modules/menu-approvals/approval-view";
import { MEAL_TYPE_LABEL, type ApprovalSnapshot } from "@/modules/menu-approvals/approval-snapshot";
import { VENUE_TYPE_OPTIONS } from "@/modules/menu-approvals/venue-options";
import type { ApprovedOrderEmail } from "@/lib/notifications/email/approved-order";

const APPROVED = ["CUSTOMER_APPROVED", "FINAL_LOCKED"] as const;

/** "Birthday · 9 Nov 2026 · 50 Guests (40 adults · 3 under 5 · 7 aged 5–10)": the same words the customer's page uses. Pure. */
export function orderDetailsLine(view: { eventType: string | null; dateText: string; guests: number | null; adults: number | null; childBelow5: number; child5To10: number }): string {
  const people =
    view.guests === null
      ? null
      : `${view.guests} ${view.guests === 1 ? "Guest" : "Guests"}${
          view.childBelow5 + view.child5To10 > 0
            ? ` (${[`${view.adults ?? 0} adults`, view.childBelow5 > 0 ? `${view.childBelow5} under 5` : null, view.child5To10 > 0 ? `${view.child5To10} aged 5–10` : null].filter(Boolean).join(" · ")})`
            : ""
          }`;
  return [view.eventType, view.dateText, people].filter(Boolean).join(" · ");
}

type VenueFields = {
  venueType: string | null;
  venue: string | null;
  venueDoorNumber: string | null;
  venueTower: string | null;
  venueFloor: string | null;
  eventAddress: string | null;
  venueLandmark: string | null;
  venueContactName: string | null;
  venueContactPhone: string | null;
};

/** One venue as lines: place, address, landmark, contact. Empty when nothing was given. */
export function venueLines(v: VenueFields): string[] {
  const typeLabel = VENUE_TYPE_OPTIONS.find((o) => o.value === v.venueType)?.label ?? null;
  const unit = [v.venueDoorNumber, v.venueTower, v.venueFloor].filter(Boolean).join(", ");
  return [
    [v.venue, typeLabel && v.venue ? `(${typeLabel})` : typeLabel].filter(Boolean).join(" "),
    [unit, v.eventAddress].filter(Boolean).join(", "),
    v.venueLandmark ? `Landmark: ${v.venueLandmark}` : "",
    [v.venueContactName, v.venueContactPhone].filter(Boolean).length ? `Contact: ${[v.venueContactName, v.venueContactPhone].filter(Boolean).join(" · ")}` : "",
  ].filter(Boolean);
}

/**
 * What the "your order is approved" email adds to the usual order lines (AJ, 2026-10-19): the selected menu, the order summary line,
 * the customer's own status page, the venue (if they have sent it yet), the price summary, a share link with its QR and the kitchen's
 * contact. Everything is read from the version the customer approved. Null when the order has no approved menu (a status set by hand),
 * and the email then stays the short one. Switching the share link on here is the same call the customer's "Create share link" makes.
 */
export async function approvedOrderEmailDetails(organizationId: string, orderId: string): Promise<ApprovedOrderEmail | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: {
      venueType: true,
      venue: true,
      venueDoorNumber: true,
      venueTower: true,
      venueFloor: true,
      eventAddress: true,
      venueLandmark: true,
      venueContactName: true,
      venueContactPhone: true,
      venueDetailsSubmittedAt: true,
      venuePerEvent: true,
      eventVenues: { orderBy: { date: "asc" } },
      organization: { select: { name: true, contactPhone: true, contactEmail: true, addressLine1: true, addressLine2: true, city: true } },
      events: { select: { menuSelection: { select: { status: true, currentVersion: true, id: true } } } },
    },
  });
  if (!order) return null;
  const selection = order.events.map((e) => e.menuSelection).find((m) => m && (APPROVED as readonly string[]).includes(m.status));
  if (!selection) return null;
  const version = await prisma.menuVersion.findUnique({ where: { menuSelectionId_versionNumber: { menuSelectionId: selection.id, versionNumber: selection.currentVersion } }, select: { id: true, snapshot: true } });
  if (!version?.snapshot) return null;
  const view = buildApprovalView(version.snapshot as unknown as ApprovalSnapshot);

  const statusToken = await prisma.secureAccessToken.findFirst({ where: { organizationId, resourceType: "MENU_APPROVAL", resourceId: version.id, revokedAt: null }, orderBy: { createdAt: "desc" }, select: { token: true } });
  const shareUrl = await enableShare(organizationId, orderId);

  let venue: string[] | null = null;
  if (order.venueDetailsSubmittedAt) {
    if (order.venuePerEvent && order.eventVenues.length > 0) {
      venue = order.eventVenues.flatMap((row) => {
        const heading = `${formatApprovalDay(row.date.toISOString().slice(0, 10))} · ${MEAL_TYPE_LABEL[row.mealType]}`;
        return [heading, ...venueLines({ venueType: row.venueType, venue: row.venue, venueDoorNumber: row.venueDoorNumber, venueTower: row.venueTower, venueFloor: row.venueFloor, eventAddress: row.eventAddress, venueLandmark: row.venueLandmark, venueContactName: row.venueContactName, venueContactPhone: row.venueContactPhone })];
      });
    } else {
      venue = venueLines(order);
    }
    if (venue.length === 0) venue = null;
  }

  const org = order.organization;
  const names = view.menus.map((m) => m.name);
  return {
    menuName: view.isCustomMenu && names.length === 0 ? "Custom Menu" : names.join(", "),
    orderDetails: orderDetailsLine(view),
    statusUrl: statusToken ? canonicalUrl(`/menu-approval/${statusToken.token}`) : null,
    venue,
    priceRows: view.priceRows,
    total: view.total,
    shareUrl,
    shareQrUrl: shareUrl ? `${shareUrl}/qr` : null,
    kitchen: { name: org.name, phone: org.contactPhone, email: org.contactEmail, address: [org.addressLine1, org.addressLine2, org.city].filter(Boolean).join(", ") || null },
  };
}
