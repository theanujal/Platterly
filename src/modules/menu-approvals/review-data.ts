import "server-only";
import { getMenuSelection, listMenuApprovalNotes } from "./menu-approval";
import { listStatusChanges } from "./status-history";
import { getActiveApprovalUrl, getApprovalFreshness } from "./approval-link";
import type { ApprovalSnapshot } from "./approval-snapshot";
import { getOrder } from "@/modules/orders/order";
import { menuGuestCount, priceMeals } from "@/modules/orders/meal-pricing";
import { listMenus } from "@/modules/menus/menu";
import { parseCustomCharges, sumCustomCharges } from "@/modules/orders/custom-charges";
import { MENU_SELECTION_STATUS_LABEL } from "@/modules/orders/order-status";
import type { MealSelection } from "@/components/catalog/menu-planning-section";
import type { MenuApprovalReviewProps } from "./_components/review/types";

/** The review's data without `capabilities`, which depend on the caller's permissions and are added by the page. */
export type MenuApprovalReviewData = Omit<MenuApprovalReviewProps, "capabilities">;

type LoadedMenuSelection = NonNullable<Awaited<ReturnType<typeof getMenuSelection>>>;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Every ISO day from start to end, inclusive (UTC, like the order's own dates). */
function enumerateDays(start: Date, end: Date): string[] {
  const days: string[] = [];
  for (let t = start.getTime(); t <= end.getTime() && days.length < 366; t += 86_400_000) days.push(isoDay(new Date(t)));
  return days;
}

/**
 * Everything the review of one menu approval shows, shaped as plain data for the client components (moved unchanged from
 * the old `/menu-approvals/[id]` page, which now redirects to the order's tab). Every read is scoped by `organizationId`. It does NOT check who is asking: the caller has
 * already required `menus: approve` and the location access for `menuSelection` (which must be one it loaded with
 * `getMenuSelection` for the same business), and must not call this before doing so. Returns null when the selection has no order
 * or the order cannot be found.
 */
export async function loadMenuApprovalReviewData(
  organizationId: string,
  menuSelection: LoadedMenuSelection,
  options: { viewVersion?: number | null } = {},
): Promise<MenuApprovalReviewData | null> {
  const orderId = menuSelection.event.orderId;
  if (!orderId) return null;
  const [order, menus, notes, statusChanges, approvalUrl, freshness] = await Promise.all([
    getOrder(organizationId, orderId),
    listMenus(organizationId),
    listMenuApprovalNotes(organizationId, menuSelection.id),
    listStatusChanges(organizationId, orderId, { subject: "MENU_APPROVAL" }),
    getActiveApprovalUrl(organizationId, menuSelection.id),
    options.viewVersion ? Promise.resolve(null) : getApprovalFreshness(organizationId, menuSelection.id),
  ]);
  if (!order) return null;

  const entries: MealSelection[] = order.mealPlanEntries.map((entry) => ({
    date: isoDay(entry.date),
    mealType: entry.mealType,
    price: entry.price?.toString() ?? "",
    menuId: entry.menuId ?? "",
    items: entry.items.map((item) => ({
      key: item.id,
      itemType: item.itemType === "ADD_ON" ? ("ADD_ON" as const) : ("MENU_ITEM" as const),
      catalogId: (item.itemType === "ADD_ON" ? item.addOnId : item.menuItemId) ?? "",
      name: item.name,
      unitPrice: Number(item.unitPrice),
      // Extra dishes and per-plate add-ons are charged for every guest.
      perGuest: item.itemType === "ADD_ON" ? item.quantity > 1 : item.isExtra,
    })),
  }));

  // The order's date range, plus any day a meal is already planned on.
  const eventDays = enumerateDays(order.eventStartDate, order.eventEndDate);
  const days = [...new Set([...eventDays, ...entries.map((e) => e.date)])].sort();
  // What the order holds, the way recalculateOrderTotals works it out (stored item quantities, stored rupee amounts).
  const savedMeals = priceMeals(
    order.mealPlanEntries.map((entry) => ({
      price: entry.price === null ? null : Number(entry.price),
      menuPricePerPlate: entry.menuId ? Number(menus.find((m) => m.id === entry.menuId)?.pricePerPlate ?? 0) : null,
      items: entry.items.map((item) => ({ itemType: item.itemType, unitPrice: Number(item.unitPrice), quantity: item.quantity, isExtra: item.isExtra })),
    })),
    order.individualPricingEnabled,
    menuGuestCount(order),
  );
  const savedCustomCharges = sumCustomCharges(parseCustomCharges(order.customCharges));
  const totalGuests = order.totalParticipants ?? (order.adultCount ?? 0) + (order.childBelow5Count ?? 0) + (order.child5To10Count ?? 0);
  const eventDate = order.eventStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const eventDateText =
    order.eventStartDate.getTime() === order.eventEndDate.getTime()
      ? eventDate
      : `${order.eventStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${order.eventEndDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

  return {
    menuSelectionId: menuSelection.id,
    status: menuSelection.status,
    statusLabel: MENU_SELECTION_STATUS_LABEL[menuSelection.status],
    orderCompleted: order.status === "COMPLETED",
    currentVersion: menuSelection.currentVersion,
    lockedAt: menuSelection.lockedAt,
    isCustomMenu: menuSelection.isCustomMenu,
    customPricePerPlate: menuSelection.customPricePerPlate ? Number(menuSelection.customPricePerPlate) : null,
    header: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customer: order.customer.name,
      eventType: order.eventType?.name ?? null,
      eventDate: eventDateText,
      guests: totalGuests,
      kitchen: menuSelection.event.assignedKitchen?.name ?? null,
    },
    pricing: {
      individualPricingEnabled: order.individualPricingEnabled,
      menuGuests: menuGuestCount(order),
      totalGuests,
      childrenCharge: Number(order.childrenCharge),
      discount: Number(order.discount),
      transportationCost: Number(order.transportationCost),
      otherCharges: Number(order.otherCharges),
      customCharges: savedCustomCharges,
      discountMode: order.discountMode,
      discountRate: Number(order.discountRate),
      otherChargesMode: order.otherChargesMode,
      otherChargesRate: Number(order.otherChargesRate),
      transportationMode: order.transportationMode,
      transportationRate: Number(order.transportationRate),
      customChargeLines: parseCustomCharges(order.customCharges),
      saved: {
        menuAmount: savedMeals.menuAmount,
        extrasAmount: savedMeals.extrasAmount,
        childrenCharge: Number(order.childrenCharge),
        chargesAndDiscount: Number(order.transportationCost) + Number(order.otherCharges) + savedCustomCharges - Number(order.discount),
        total: Number(order.total),
      },
    },
    menuPreference: order.menuPreference ?? "",
    days,
    eventDays,
    entries,
    menus: menus
      .filter((m) => m.isActive || entries.some((e) => e.menuId === m.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        menuType: m.menuType,
        price: Number(m.pricePerPlate),
        childUnder5Chargeable: m.childUnder5Chargeable,
        childUnder5Price: m.childUnder5Price !== null ? Number(m.childUnder5Price) : null,
        child5To10PricingType: m.child5To10PricingType,
        child5To10PriceValue: m.child5To10PriceValue !== null ? Number(m.child5To10PriceValue) : null,
      })),
    notes: notes.map((n) => ({
      id: n.id,
      authorType: n.authorType,
      authorName: n.authorName,
      body: n.body,
      versionNumber: n.versionNumber,
      createdAt: n.createdAt,
    })),
    versions: menuSelection.versions.map((v) => ({
      versionNumber: v.versionNumber,
      createdAt: v.createdAt,
      sentAt: v.sentAt,
      superseded: v.supersededAt !== null,
      snapshot: (v.snapshot as ApprovalSnapshot | null) ?? null,
    })),
    statusHistory: statusChanges.map((c) => ({
      id: c.id,
      subject: c.subject,
      fromStatus: c.fromStatus,
      toStatus: c.toStatus,
      source: c.source,
      trigger: c.trigger,
      reason: c.reason,
      actorName: c.actorName,
      createdAt: c.createdAt,
    })),
    approvalUrl,
    venueDetailsSubmittedAt: order.venueDetailsSubmittedAt?.toISOString() ?? null,
    viewVersion: options.viewVersion ?? null,
    freshness,
  };
}
