import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasPermission, requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getMenuSelection, listMenuApprovalNotes } from "@/modules/menu-approvals/menu-approval";
import { listStatusChanges } from "@/modules/menu-approvals/status-history";
import { getActiveApprovalUrl } from "@/modules/menu-approvals/approval-link";
import type { ApprovalSnapshot } from "@/modules/menu-approvals/approval-snapshot";
import { getOrder } from "@/modules/orders/order";
import { menuGuestCount } from "@/modules/orders/meal-pricing";
import { listMenus } from "@/modules/menus/menu";
import type { MealSelection } from "@/components/catalog/menu-planning-section";
import { MenuApprovalReview } from "./_components/menu-approval-review";
import { MENU_SELECTION_STATUS_LABEL } from "@/modules/orders/order-status";

export const metadata: Metadata = {
  title: "Menu Approval — Platterly",
  robots: { index: false, follow: false },
};

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Every ISO day from start to end, inclusive (UTC, like the order's own dates). */
function enumerateDays(start: Date, end: Date): string[] {
  const days: string[] = [];
  for (let t = start.getTime(); t <= end.getTime() && days.length < 366; t += 86_400_000) days.push(isoDay(new Date(t)));
  return days;
}

export default async function MenuApprovalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { id } = await params;
  const { version } = await searchParams;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);

  const menuSelection = await getMenuSelection(organizationId, id);
  if (!menuSelection?.event.orderId) notFound();

  const [order, menus, notes, statusChanges, approvalUrl, canOpenOrder] = await Promise.all([
    getOrder(organizationId, menuSelection.event.orderId),
    listMenus(organizationId),
    listMenuApprovalNotes(organizationId, id),
    listStatusChanges(organizationId, menuSelection.event.orderId, { subject: "MENU_APPROVAL" }),
    getActiveApprovalUrl(organizationId, menuSelection.id),
    hasPermission({ orders: ["edit"] }, organizationId),
  ]);
  if (!order) notFound();

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
  const days = [...new Set([...enumerateDays(order.eventStartDate, order.eventEndDate), ...entries.map((e) => e.date)])].sort();
  const totalGuests = order.totalParticipants ?? (order.adultCount ?? 0) + (order.childBelow5Count ?? 0) + (order.child5To10Count ?? 0);
  const eventDate = order.eventStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const eventDateText =
    order.eventStartDate.getTime() === order.eventEndDate.getTime()
      ? eventDate
      : `${order.eventStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${order.eventEndDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <MenuApprovalReview
        menuSelectionId={menuSelection.id}
        status={menuSelection.status}
        statusLabel={MENU_SELECTION_STATUS_LABEL[menuSelection.status]}
        currentVersion={menuSelection.currentVersion}
        lockedAt={menuSelection.lockedAt}
        isCustomMenu={menuSelection.isCustomMenu}
        customPricePerPlate={menuSelection.customPricePerPlate ? Number(menuSelection.customPricePerPlate) : null}
        header={{
          orderId: order.id,
          orderNumber: order.orderNumber,
          customer: order.customer.name,
          eventType: order.eventType?.name ?? null,
          eventDate: eventDateText,
          guests: totalGuests,
          kitchen: menuSelection.event.assignedKitchen?.name ?? null,
          canOpenOrder,
        }}
        pricing={{
          individualPricingEnabled: order.individualPricingEnabled,
          menuGuests: menuGuestCount(order),
          totalGuests,
          childrenCharge: Number(order.childrenCharge),
          discount: Number(order.discount),
          transportationCost: Number(order.transportationCost),
          otherCharges: Number(order.otherCharges),
        }}
        menuPreference={order.menuPreference ?? ""}
        days={days}
        entries={entries}
        menus={menus
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
          }))}
        notes={notes.map((n) => ({
          id: n.id,
          authorType: n.authorType,
          authorName: n.authorName,
          body: n.body,
          versionNumber: n.versionNumber,
          createdAt: n.createdAt,
        }))}
        versions={menuSelection.versions.map((v) => ({
          versionNumber: v.versionNumber,
          createdAt: v.createdAt,
          sentAt: v.sentAt,
          superseded: v.supersededAt !== null,
          snapshot: (v.snapshot as ApprovalSnapshot | null) ?? null,
        }))}
        statusHistory={statusChanges.map((c) => ({
          id: c.id,
          subject: c.subject,
          fromStatus: c.fromStatus,
          toStatus: c.toStatus,
          source: c.source,
          trigger: c.trigger,
          reason: c.reason,
          actorName: c.actorName,
          createdAt: c.createdAt,
        }))}
        approvalUrl={approvalUrl}
        viewVersion={version && /^\d+$/.test(version) ? Number(version) : null}
      />
    </div>
  );
}
