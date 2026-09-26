import { notFound } from "next/navigation";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { getOrder } from "@/modules/orders/order";
import { getOrderMenuApproval } from "@/modules/menu-approvals/approval-link";
import { listCustomers } from "@/modules/customers/customer";
import { listEventTypes } from "@/modules/events/event-type";
import { listMenus } from "@/modules/menus/menu";
import { listKitchens } from "@/modules/events/event";
import { listInventoryItems } from "@/modules/inventory/inventory";
import { Receipt, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { EditOrderClient } from "./_components/edit-order-client";
import { DeleteOrderButton } from "./_components/delete-order-button";
import { EventOperationsCard } from "./_components/event-operations-card";
import { RequiredInventoryCard } from "./_components/required-inventory-card";
import { OrderApprovalPanel } from "./_components/order-approval-panel";
import type { OrderFormValues } from "../_components/order-form";
import type { OrderKind } from "@/generated/prisma/enums";
import type { LucideIcon } from "lucide-react";

const ORDER_KIND_LABEL: Record<OrderKind, string> = {
  SINGLE: "Single Order",
  MULTI: "Multi Order",
};

// Kept in sync with the same legend in ../page.tsx (AJ, 2026-09-19).
const ORDER_KIND_VARIANT: Record<OrderKind, "neutral" | "info"> = {
  SINGLE: "neutral",
  MULTI: "info",
};

const ORDER_KIND_ICON: Record<OrderKind, LucideIcon> = {
  SINGLE: Receipt,
  MULTI: Layers,
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["edit"] }, organizationId);
  const [order, customers, eventTypes, menus, kitchens, inventoryItems, canManageApproval, menuApproval] = await Promise.all([
    getOrder(organizationId, id),
    listCustomers(organizationId),
    listEventTypes(organizationId),
    listMenus(organizationId),
    listKitchens(organizationId),
    listInventoryItems(organizationId),
    hasPermission({ menus: ["approve"] }, organizationId),
    getOrderMenuApproval(organizationId, id),
  ]);
  if (!order) notFound();

  const initialValues: OrderFormValues = {
    customerId: order.customerId,
    eventTypeId: order.eventTypeId ?? "",
    menuPreference: order.menuPreference ?? "",
    orderKind: order.orderKind,
    eventStartDate: toDateInputValue(order.eventStartDate),
    eventEndDate: toDateInputValue(order.eventEndDate),
    venue: order.venue ?? "",
    eventAddress: order.eventAddress ?? "",
    venueType: order.venueType ?? "",
    venueLandmark: order.venueLandmark ?? "",
    venueContactName: order.venueContactName ?? "",
    venueContactPhone: order.venueContactPhone ?? "",
    liveCounterAvailable: order.liveCounterAvailable ?? false,
    gasElectricAvailable: order.gasElectricAvailable ?? false,
    deliveryInstructions: order.deliveryInstructions ?? "",
    cookingInstructions: order.cookingInstructions ?? "",
    adultCount: order.adultCount?.toString() ?? "",
    childBelow5Count: order.childBelow5Count?.toString() ?? "",
    child5To10Count: order.child5To10Count?.toString() ?? "",
    totalParticipants: order.totalParticipants?.toString() ?? "",
    pricingMethod: order.pricingMethod,
    individualChildBelow5Rate: order.individualChildBelow5Rate?.toString() ?? "",
    individualChildBelow5PricingType: order.individualChildBelow5PricingType ?? "FIXED",
    individualChild5To10Rate: order.individualChild5To10Rate?.toString() ?? "",
    individualChild5To10PricingType: order.individualChild5To10PricingType ?? "FIXED",
    individualPricingEnabled: order.individualPricingEnabled,
    discount: order.discount.toString(),
    transportationCost: order.transportationCost.toString(),
    otherCharges: order.otherCharges.toString(),
    advance: order.advance.toString(),
    paymentStatus: order.paymentStatus,
    status: order.status,
    notes: order.notes ?? "",
    kitchenNotes: order.kitchenNotes ?? "",
    mealPlanEntries: order.mealPlanEntries.map((entry) => ({
      date: toDateInputValue(entry.date),
      mealType: entry.mealType,
      price: entry.price?.toString() ?? "",
      menuId: entry.menuId ?? "",
      items: entry.items.map((item) => ({
        key: item.id,
        itemType: item.itemType === "ADD_ON" ? ("ADD_ON" as const) : ("MENU_ITEM" as const),
        catalogId: (item.itemType === "ADD_ON" ? item.addOnId : item.menuItemId) ?? "",
        name: item.name,
        unitPrice: Number(item.unitPrice),
        // Extras and per-plate add-ons were saved with a per-guest quantity.
        perGuest: item.quantity > 1,
      })),
    })),
  };

  const OrderKindIcon = ORDER_KIND_ICON[order.orderKind];
  // An Order's Event is created and kept in step automatically; a normal order has exactly one.
  const event = order.events[0] ?? null;

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <EditOrderClient
        orderId={order.id}
        initialValues={initialValues}
        header={
          <div className="flex flex-col gap-4">
            <PageBreadcrumb items={[{ label: "Orders", href: "/orders" }, { label: order.orderNumber ?? "Order" }]} />
            <div>
              <h1 className="text-2xl font-semibold">Order for {order.customer.name}</h1>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant={ORDER_KIND_VARIANT[order.orderKind]}>
                  <OrderKindIcon data-icon="inline-start" />
                  {ORDER_KIND_LABEL[order.orderKind]}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {order.eventStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            </div>
          </div>
        }
        headerActions={<DeleteOrderButton orderId={order.id} name={order.customer.name} />}
        beforeContent={
          <>
            {/* Menu approval (with its version history) and the kitchen / event status sit side by side (AJ, 2026-09-27). */}
            <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
              <OrderApprovalPanel orderId={order.id} approval={menuApproval} canManage={canManageApproval} />
              <EventOperationsCard
                orderId={order.id}
                event={event ? { id: event.id, assignedKitchenId: event.assignedKitchenId, status: event.status } : null}
                kitchens={kitchens.map((k) => ({ id: k.id, name: k.name }))}
              />
            </div>

            {/*
              Whole-order items (mealPlanEntryId: null) only exist on an Order
              converted from an accepted Quotation (quotation.ts's
              convertQuotationToOrder writes them directly, copying the
              Quotation's own frozen item snapshots) — the Create Order form
              itself no longer has a whole-order item picker as of the
              2026-09-20 redesign (food items are only ever picked per meal in
              Meal Planning), so this read-only recap is the only place these
              carried-over items are still visible/editable-adjacent.
            */}
            {order.items.length > 0 && (
              <section className="flex flex-col gap-2 rounded-lg border border-border p-4">
                <h2 className="text-sm font-semibold">Carried over from the original Quotation</h2>
                <div className="flex flex-col gap-1.5">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span>{item.name}</span>
                        <span className="text-muted-foreground">× {item.quantity}</span>
                      </div>
                      <span className="font-medium">{formatCurrency(Number(item.unitPrice) * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        }
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email }))}
        eventTypes={eventTypes.filter((t) => t.isActive || t.id === order.eventTypeId).map((t) => ({ id: t.id, name: t.name }))}
        menus={menus
          .filter((m) => m.isActive)
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
        carriedOverItemsSubtotal={order.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0)}
        afterContent={
          <RequiredInventoryCard
            orderId={order.id}
            event={event ? { id: event.id, requiredInventory: event.requiredInventory.map((r) => ({ inventoryId: r.inventoryId, quantity: Number(r.quantity) })) } : null}
            inventoryItems={inventoryItems.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))}
          />
        }
      />
    </div>
  );
}
