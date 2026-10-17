import "server-only";
import { getMenuSelection, listMenuApprovalNotes } from "./menu-approval";
import { listStatusChanges } from "./status-history";
import { getActiveApprovalUrl, getApprovalFreshness } from "./approval-link";
import type { ApprovalSnapshot } from "./approval-snapshot";
import { menuOptionsFor } from "@/modules/roles/redact";
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

/** The pricing block for a viewer without the order-prices right: the structure the screen expects, with every figure 0. */
function NO_PRICING(individualPricingEnabled: boolean, menuGuests: number, totalGuests: number): MenuApprovalReviewData["pricing"] {
  return {
    individualPricingEnabled,
    menuGuests,
    totalGuests,
    childrenCharge: 0,
    discount: 0,
    transportationCost: 0,
    otherCharges: 0,
    customCharges: 0,
    discountMode: "FIXED",
    discountRate: 0,
    otherChargesMode: "FIXED",
    otherChargesRate: 0,
    transportationMode: "FIXED",
    transportationRate: 0,
    customChargeLines: [],
    saved: { menuAmount: 0, extrasAmount: 0, childrenCharge: 0, chargesAndDiscount: 0, total: 0 },
  };
}

/** A sent version's frozen snapshot with every price, total and breakdown removed (names, dishes and quantities stay). */
export function snapshotWithoutPrices(snapshot: ApprovalSnapshot | null): ApprovalSnapshot | null {
  if (!snapshot) return null;
  const { breakdown: _breakdown, ...rest } = snapshot;
  void _breakdown;
  return {
    ...rest,
    total: 0,
    meals: snapshot.meals.map((meal) => ({
      ...meal,
      price: null,
      pricePerPlate: null,
      items: meal.items.map((item) => {
        const { unitPrice: _unitPrice, ...itemRest } = item;
        void _unitPrice;
        return itemRest;
      }),
    })),
  };
}

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
  options: { viewVersion?: number | null; /** false = the viewer lacks the order-prices right: no price, total or charge is built (default true: callers pass it). */ showPrices?: boolean } = {},
): Promise<MenuApprovalReviewData | null> {
  const showPrices = options.showPrices ?? false;
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
    customPricePerPlate: showPrices && menuSelection.customPricePerPlate ? Number(menuSelection.customPricePerPlate) : null,
    showPrices,
    header: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customer: order.customer.name,
      eventType: order.eventType?.name ?? null,
      eventDate: eventDateText,
      guests: totalGuests,
      kitchen: menuSelection.event.assignedKitchen?.name ?? null,
    },
    pricing: !showPrices ? NO_PRICING(order.individualPricingEnabled, menuGuestCount(order), totalGuests) : {
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
    entries: showPrices ? entries : entries.map((e) => ({ ...e, price: "", items: e.items.map((i) => ({ ...i, unitPrice: 0 })) })),
    menus: menuOptionsFor(
      menus.filter((m) => m.isActive || entries.some((e) => e.menuId === m.id)),
      showPrices,
    ),
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
      snapshot: showPrices ? ((v.snapshot as ApprovalSnapshot | null) ?? null) : snapshotWithoutPrices((v.snapshot as ApprovalSnapshot | null) ?? null),
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
    freshness: showPrices || !freshness ? freshness : { ...freshness, sentTotal: 0, currentTotal: 0, reasons: freshness.reasons.map((r) => r.replace(/\s*\(₹[^)]*\)/g, "")) },
  };
}
