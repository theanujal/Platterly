import { notFound } from "next/navigation";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { getOrder } from "@/modules/orders/order";
import { getOrderMenuApproval } from "@/modules/menu-approvals/approval-link";
import { listStatusChanges } from "@/modules/menu-approvals/status-history";
import { getOrderStatusHint } from "@/modules/orders/order-status";
import { listCustomers } from "@/modules/customers/customer";
import { listEventTypes } from "@/modules/events/event-type";
import { listMenus } from "@/modules/menus/menu";
import { listKitchens } from "@/modules/events/event";
import { listInventoryItems } from "@/modules/inventory/inventory";
import { prisma } from "@/lib/db";
import { listOrderPayments } from "@/modules/payments/payment";
import { confirmedPaidForOrder } from "@/modules/invoices/invoice";
import { PaymentsPanel, type PaymentRowData } from "../../invoices/_components/payments-panel";
import { CreateInvoiceButton, OpenInvoiceLink } from "../../invoices/_components/invoice-actions";
import { CalendarDays, Layers, Receipt, Tag, Users, UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { EditOrderClient } from "./_components/edit-order-client";
import { DeleteOrderButton } from "./_components/delete-order-button";
import { EventOperationsCard } from "./_components/event-operations-card";
import { RequiredInventoryCard } from "./_components/required-inventory-card";
import { OrderApprovalPanel } from "./_components/order-approval-panel";
import { OrderSummaryCard } from "./_components/order-summary-card";
import { OrderStatusCard } from "./_components/order-status-card";
import { MenuStatusBanner } from "./_components/menu-status-banner";
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

function formatEventDates(start: Date, end: Date) {
  const day = (d: Date, withYear: boolean) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
  return start.getTime() === end.getTime() ? day(start, true) : `${day(start, false)} – ${day(end, true)}`;
}

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["edit"] }, organizationId);
  const [order, customers, eventTypes, menus, kitchens, inventoryItems, canManageApproval, menuApproval, statusHistory] = await Promise.all([
    getOrder(organizationId, id),
    listCustomers(organizationId),
    listEventTypes(organizationId),
    listMenus(organizationId),
    listKitchens(organizationId),
    listInventoryItems(organizationId),
    hasPermission({ menus: ["approve"] }, organizationId),
    getOrderMenuApproval(organizationId, id),
    listStatusChanges(organizationId, id, { subject: "ORDER" }),
  ]);
  if (!order) notFound();

  const [orderPayments, confirmedPaid, activeInvoice, billingOrg, canCreateInvoice, canRecordPayment, canManagePayment] = await Promise.all([
    listOrderPayments(organizationId, id),
    confirmedPaidForOrder(id),
    prisma.invoice.findFirst({ where: { organizationId, orderId: id, type: "INVOICE", status: { not: "CANCELLED" } }, select: { id: true, number: true } }),
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { gstShowOnInvoices: true } }),
    hasPermission({ invoices: ["create"] }, organizationId),
    hasPermission({ payments: ["create"] }, organizationId),
    hasPermission({ payments: ["manage"] }, organizationId),
  ]);
  const paymentRows: PaymentRowData[] = orderPayments.map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    type: p.type,
    method: p.method,
    source: p.source,
    status: p.status,
    receivedAt: p.receivedAt.toISOString(),
    reference: p.reference,
    receipt: p.receipt ? { id: p.receipt.id, number: p.receipt.number } : null,
  }));
  const orderTotal = Number(order.total);

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
    vehicleAccess: order.vehicleAccess ?? "",
    venueAccessInstructions: order.venueAccessInstructions ?? "",
    venueDoorNumber: order.venueDoorNumber ?? "",
    venueTower: order.venueTower ?? "",
    venueFloor: order.venueFloor ?? "",
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
        perGuest: item.itemType === "ADD_ON" ? item.quantity > 1 : item.isExtra,
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
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold">{order.orderNumber ?? "Order"}</h1>
                <Badge variant={ORDER_KIND_VARIANT[order.orderKind]}>
                  <OrderKindIcon data-icon="inline-start" />
                  {ORDER_KIND_LABEL[order.orderKind]}
                </Badge>
              </div>
              <p className="text-base font-medium">Order for {order.customer.name}</p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
                {order.eventType && (
                  <span className="flex items-center gap-1.5">
                    <Tag className="size-4" />
                    {order.eventType.name}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-4" />
                  {order.eventStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </span>
                <span className="flex items-center gap-1.5">
                  <UtensilsCrossed className="size-4" />
                  {order.mealPlanEntries.length} {order.mealPlanEntries.length === 1 ? "Meal" : "Meals"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="size-4" />
                  {order.totalParticipants ?? 0} Guests
                </span>
              </div>
            </div>
          </div>
        }
        headerActions={<DeleteOrderButton orderId={order.id} name={order.customer.name} />}
        menuPlanBanner={
          <MenuStatusBanner
            status={menuApproval?.status ?? null}
            version={menuApproval?.currentVersion ?? null}
            editHref={canManageApproval && menuApproval ? `/menu-approvals/${menuApproval.menuSelectionId}` : null}
          />
        }
        sidebarTop={
          <>
            <OrderStatusCard
              orderId={order.id}
              status={order.status}
              hint={getOrderStatusHint(order.status, menuApproval ? [menuApproval.kitchenProductionStatus] : [])}
              history={statusHistory.map((c) => ({
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
            />
            <OrderSummaryCard
              orderNumber={order.orderNumber}
              status={order.status}
              assignedKitchen={event?.assignedKitchen?.name ?? null}
              createdAt={order.createdAt}
              updatedAt={order.updatedAt}
              customer={order.customer.name}
              orderType={ORDER_KIND_LABEL[order.orderKind]}
              eventType={order.eventType?.name ?? null}
              eventDate={formatEventDates(order.eventStartDate, order.eventEndDate)}
              venue={order.venue}
              guests={{
                total: order.totalParticipants ?? 0,
                adults: order.adultCount ?? 0,
                below5: order.childBelow5Count ?? 0,
                from5to10: order.child5To10Count ?? 0,
              }}
            />
            <OrderApprovalPanel approval={menuApproval} canManage={canManageApproval} />
            <div className="flex flex-col gap-3" data-testid="order-billing">
              {activeInvoice ? (
                <OpenInvoiceLink invoiceId={activeInvoice.id} number={activeInvoice.number} />
              ) : (
                canCreateInvoice && orderTotal > 0 && <CreateInvoiceButton orderId={order.id} gstEnabled={billingOrg.gstShowOnInvoices === true} defaultDueDate={toDateInputValue(order.eventStartDate)} />
              )}
              <PaymentsPanel
                orderId={order.id}
                invoiceId={activeInvoice?.id}
                total={orderTotal}
                paid={confirmedPaid}
                balance={Math.max(orderTotal - confirmedPaid, 0)}
                payments={paymentRows}
                canRecord={canRecordPayment}
                canManage={canManagePayment}
              />
            </div>
            <EventOperationsCard
              orderId={order.id}
              event={event ? { id: event.id, assignedKitchenId: event.assignedKitchenId } : null}
              kitchens={kitchens.map((k) => ({ id: k.id, name: k.name }))}
            />
          </>
        }
        pricingExtra={
          <>
            {/* Whole-order items only exist on an Order converted from an accepted Quotation (convertQuotationToOrder copies the Quotation's frozen item snapshots); the order form has no picker for them, so this read-only recap is where they show. */}
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
        inventoryTab={
          <RequiredInventoryCard
            orderId={order.id}
            event={
              event
                ? { id: event.id, requiredInventory: event.requiredInventory.map((r) => ({ inventoryId: r.inventoryId, quantity: Number(r.quantity) })) }
                : null
            }
            inventoryItems={inventoryItems.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))}
          />
        }
      />
    </div>
  );
}
