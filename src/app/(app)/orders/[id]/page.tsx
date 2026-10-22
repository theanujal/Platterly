import type { Metadata } from "next";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { requireActiveOrganization, requirePermission, hasPermission, sensitiveAccess } from "@/lib/auth/require-session";
import { menuOptionsFor } from "@/modules/roles/redact";
import { assertOrderAtMyLocation, getActiveLocation } from "@/modules/locations/active-location";
import { getOrder } from "@/modules/orders/order";
import { getOrderMenuApproval } from "@/modules/menu-approvals/approval-link";
import { getMenuSelection } from "@/modules/menu-approvals/menu-approval";
import { loadMenuApprovalReviewData } from "@/modules/menu-approvals/review-data";
import { approvalCapabilities, notStartedState, orderPageMode, parseOrderTab, priceIsFrozen, menuIsWithCustomer } from "@/modules/menu-approvals/page-access";
import { listStatusChanges } from "@/modules/menu-approvals/status-history";
import { getOrderStatusHint, KITCHEN_STATUS_TONE, MENU_SELECTION_STATUS_LABEL, MENU_SELECTION_STATUS_TONE } from "@/modules/orders/order-status";
import { KITCHEN_PRODUCTION_STATUS_LABEL } from "@/modules/menu-approvals/kitchen-production-status";
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
import { OrderSummaryCard } from "./_components/order-summary-card";
import { ExpensesCard } from "./_components/expenses-card";
import { listOrderExpenses } from "@/modules/expenses/expense";
import { listSupplierOptions } from "@/modules/suppliers/supplier";
import { getOrderInventory } from "@/modules/production/production";
import { orderStockCostTotals } from "@/modules/inventory/batches";
import { getGstSettings } from "@/modules/payments/payment-settings";
import { EventOps } from "../../staff/_components/event-ops";
import { OrderInventoryPanel } from "./_components/order-inventory-panel";
import { computeProfitability } from "@/modules/expenses/profitability";
import { OrderStatusCard } from "./_components/order-status-card";
import { OrderMenuApprovalTab } from "./_components/order-menu-approval-tab";
import { ApprovalOnlyOrderView } from "./_components/approval-only-order-view";
import { isKitchenLocked } from "@/modules/orders/order-lock";
import { isOrderLocked } from "@/modules/orders/order-lock";
import type { OrderFormValues } from "../_components/order-form";
import { parseCustomCharges } from "@/modules/orders/custom-charges";
import { getTenantTimeZone } from "@/lib/settings/timezone";
import { customerHasApproved, derivePaymentState, isPaymentOverdue } from "@/modules/payments/payment-math";
import type { OrderKind } from "@/generated/prisma/enums";
import type { LucideIcon } from "lucide-react";
import { inrPlain } from "@/modules/invoices/invoice-format";

export const metadata: Metadata = {
  title: "Order — Caterly",
  robots: { index: false, follow: false },
};


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

export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; version?: string }> }) {
  const { id } = await params;
  const { tab, version } = await searchParams;
  const viewVersion = version && /^\d+$/.test(version) ? Number(version) : null;
  const { organizationId, session } = await requireActiveOrganization();
  const [canEditOrders, canApproveMenus, canViewOrders] = await Promise.all([
    hasPermission({ orders: ["edit"] }, organizationId),
    hasPermission({ menus: ["approve"] }, organizationId),
    hasPermission({ orders: ["view"] }, organizationId),
  ]);
  const can = { editOrders: canEditOrders, approveMenus: canApproveMenus, viewOrders: canViewOrders };
  const mode = orderPageMode(can);
  // Sensitive data is separate from module access (AJ, 2026-10-17): opening an order shows no price, payment or cost without its own key.
  const prices = await sensitiveAccess(organizationId);
  // Someone with neither permission gets the same 403 as before.
  if (mode === "none") await requirePermission({ orders: ["edit"] }, organizationId);
  await assertOrderAtMyLocation(organizationId, session.user.id, id);
  const active = await getActiveLocation(organizationId, session.user.id);
  if (mode === "approval-only") return approvalOnlyPage({ organizationId, orderId: id, activeEnabled: active.enabled, viewVersion, can, showPrices: prices.orderPrices, canMoveKitchenStage: await hasPermission({ kitchen: ["updateStatus"] }, organizationId) });
  const [order, customers, eventTypes, menus, kitchens, inventoryItems, , menuApproval, statusHistory] = await Promise.all([
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
  // The Menu Approval tab (where /menu-approvals/[id] redirects), for the viewer's capabilities (read-only without menus: approve).
  const approvalSelection = menuApproval ? await getMenuSelection(organizationId, menuApproval.menuSelectionId) : null;
  const reviewData = approvalSelection ? await loadMenuApprovalReviewData(organizationId, approvalSelection, { viewVersion, showPrices: prices.orderPrices }) : null;

  const [orderPayments, confirmedPaid, activeInvoice, billingOrg, canCreateInvoice, canRecordPayment, canManagePayment, gstDefaults] = await Promise.all([
    listOrderPayments(organizationId, id),
    confirmedPaidForOrder(id),
    prisma.invoice.findFirst({ where: { organizationId, orderId: id, type: "INVOICE", status: { not: "CANCELLED" } }, select: { id: true, number: true } }),
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { gstShowOnInvoices: true } }),
    hasPermission({ invoices: ["create"] }, organizationId),
    hasPermission({ payments: ["create"] }, organizationId),
    hasPermission({ payments: ["manage"] }, organizationId),
    getGstSettings(organizationId),
  ]);
  const [canViewExpenses, canCreateExpense, canEditExpense, canDeleteExpense] = await Promise.all([
    hasPermission({ expenses: ["view"] }, organizationId),
    hasPermission({ expenses: ["create"] }, organizationId),
    hasPermission({ expenses: ["edit"] }, organizationId),
    hasPermission({ expenses: ["delete"] }, organizationId),
  ]);
  const expenses = canViewExpenses ? await listOrderExpenses(organizationId, id) : [];
  const supplierOptions = canViewExpenses ? await listSupplierOptions(organizationId) : [];
  const canViewStaffing = await hasPermission({ staffing: ["view"] }, organizationId);
  const [orderInventory, canTakeStock] = await Promise.all([getOrderInventory(organizationId, id), hasPermission({ inventory: ["edit"] }, organizationId)]);
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
  // The food cost of this order: what the inventory sent to it cost, taken from the batches it came from.
  const stockCost = (await orderStockCostTotals([id])).get(id) ?? { cost: 0, unknownQuantity: 0 };

  const showPrices = prices.orderPrices;
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
    // Without the order-prices right the form is given the structure and no figures; the server keeps the saved pricing on save.
    pricingMethod: order.pricingMethod,
    individualChildBelow5Rate: showPrices ? order.individualChildBelow5Rate?.toString() ?? "" : "",
    individualChildBelow5PricingType: order.individualChildBelow5PricingType ?? "FIXED",
    individualChild5To10Rate: showPrices ? order.individualChild5To10Rate?.toString() ?? "" : "",
    individualChild5To10PricingType: order.individualChild5To10PricingType ?? "FIXED",
    individualPricingEnabled: order.individualPricingEnabled,
    discount: !showPrices ? "0" : order.discountMode === "PERCENTAGE" ? order.discountRate.toString() : order.discount.toString(),
    discountMode: order.discountMode,
    transportationCost: !showPrices ? "0" : order.transportationMode === "PERCENTAGE" ? order.transportationRate.toString() : order.transportationCost.toString(),
    transportationMode: order.transportationMode,
    otherCharges: !showPrices ? "0" : order.otherChargesMode === "PERCENTAGE" ? order.otherChargesRate.toString() : order.otherCharges.toString(),
    otherChargesMode: order.otherChargesMode,
    customCharges: (!showPrices ? [] : parseCustomCharges(order.customCharges)).map((c) => (c.mode === "PERCENTAGE" ? { label: c.label, amount: String(c.rate ?? 0), mode: "PERCENTAGE" as const } : { label: c.label, amount: c.amount.toString(), mode: "FIXED" as const })),
    venuePerEvent: order.venuePerEvent,
    eventVenues: Object.fromEntries(
      order.eventVenues.map((row) => [
        `${row.date.toISOString().slice(0, 10)}-${row.mealType}`,
        {
          venueType: row.venueType,
          venue: row.venue,
          venueDoorNumber: row.venueDoorNumber ?? "",
          venueTower: row.venueTower ?? "",
          venueFloor: row.venueFloor ?? "",
          eventAddress: row.eventAddress,
          venueLandmark: row.venueLandmark ?? "",
          venueContactName: row.venueContactName,
          venueContactPhone: row.venueContactPhone,
          venueAccessInstructions: row.venueAccessInstructions ?? "",
          cookingInstructions: row.cookingInstructions ?? "",
          gasElectricAvailable: row.gasElectricAvailable,
          liveCounterAvailable: row.liveCounterAvailable,
        },
      ]),
    ),
    status: order.status,
    notes: order.notes ?? "",
    kitchenNotes: order.kitchenNotes ?? "",
    staffingNotes: order.staffingNotes ?? "",
    mealPlanEntries: order.mealPlanEntries.map((entry) => ({
      date: toDateInputValue(entry.date),
      mealType: entry.mealType,
      price: showPrices ? entry.price?.toString() ?? "" : "",
      menuId: entry.menuId ?? "",
      items: entry.items.map((item) => ({
        key: item.id,
        itemType: item.itemType === "ADD_ON" ? ("ADD_ON" as const) : ("MENU_ITEM" as const),
        catalogId: (item.itemType === "ADD_ON" ? item.addOnId : item.menuItemId) ?? "",
        name: item.name,
        unitPrice: showPrices ? Number(item.unitPrice) : 0,
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
        priceFrozen={priceIsFrozen(menuApproval?.status ?? null)}
        withCustomer={menuIsWithCustomer(menuApproval?.status ?? null)}
        initialTab={parseOrderTab(tab)}
        menuApprovalTab={
          <OrderMenuApprovalTab
            key="menu-approval-tab"
            data={reviewData ? { ...reviewData, capabilities: approvalCapabilities(can) } : null}
            notStarted={{ orderId: order.id, ...notStartedState(order, can) }}
          />
        }
        locked={isKitchenLocked(order.status, menuApproval ? [menuApproval.status] : [])}
        completed={order.status === "COMPLETED"}
        initialValues={initialValues}
        header={
          <div key="header" className="flex flex-col gap-4">
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
        headerActions={isOrderLocked(order.status) ? undefined : <DeleteOrderButton key="header-actions" orderId={order.id} name={order.customer.name} />}
        statusCard={
          <Fragment key="status-card">
            <OrderStatusCard
              orderId={order.id}
              status={order.status}
              extraBadges={
                menuApproval
                  ? [
                      { label: `Menu Status: ${MENU_SELECTION_STATUS_LABEL[menuApproval.status]}`, tone: MENU_SELECTION_STATUS_TONE[menuApproval.status] },
                      ...(menuApproval.status === "FINAL_LOCKED"
                        ? [{ label: `Kitchen Status: ${KITCHEN_PRODUCTION_STATUS_LABEL[menuApproval.kitchenProductionStatus]}`, tone: KITCHEN_STATUS_TONE[menuApproval.kitchenProductionStatus] }]
                        : []),
                    ]
                  : undefined
              }
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
          </Fragment>
        }
        detailsExtra={
          <Fragment key="details-extra">
            {active.enabled && (
              <fieldset disabled={order.status === "COMPLETED"} className="m-0 min-w-0 border-0 p-0 disabled:[&_button]:pointer-events-none disabled:[&_[role=combobox]]:pointer-events-none disabled:[&_:disabled]:opacity-100!">
              <EventOperationsCard
                orderId={order.id}
                event={event ? { id: event.id, assignedKitchenId: event.assignedKitchenId } : null}
                kitchens={kitchens.filter((k) => !active.locked || k.id === active.locationId).map((k) => ({ id: k.id, name: k.name }))}
              />
              </fieldset>
            )}
          </Fragment>
        }
        sidebarTop={
          <Fragment key="sidebar-top">
            <OrderSummaryCard
              orderNumber={order.orderNumber}
              status={order.status}
              assignedKitchen={event?.assignedKitchen?.name ?? null}
              showKitchen={active.enabled}
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
          </Fragment>
        }
        sidebarInvoiceAction={
          prices.commercialDocuments && (activeInvoice || (canCreateInvoice && orderTotal > 0)) ? (
            <div key="sidebar-invoice-action" className="flex flex-col [&>a]:w-full [&>button]:w-full" data-testid="sidebar-invoice-action">
              {activeInvoice ? (
                <OpenInvoiceLink invoiceId={activeInvoice.id} number={activeInvoice.number} />
              ) : (
                <CreateInvoiceButton orderId={order.id} gstEnabled={billingOrg.gstShowOnInvoices === true} defaultDueDate={toDateInputValue(order.eventStartDate)} defaultGstType={gstDefaults.type} defaultGstRate={gstDefaults.rate} />
              )}
            </div>
          ) : undefined
        }
        billingPanel={
          !prices.paymentDetails ? undefined : <div key="order-billing" className="flex flex-col gap-3" data-testid="order-billing">
              <PaymentsPanel
                orderId={order.id}
                invoiceId={activeInvoice?.id}
                total={orderTotal}
                paid={confirmedPaid}
                balance={Math.max(orderTotal - confirmedPaid, 0)}
                payments={paymentRows}
                canRecord={canRecordPayment}
                recordBlocked={!customerHasApproved(order.status)}
                canManage={canManagePayment}
                overdue={isPaymentOverdue({ status: order.status, paymentStatus: derivePaymentState(orderTotal, confirmedPaid), eventEndDate: order.eventEndDate }, new Date(), await getTenantTimeZone(organizationId))}
              />
            </div>
        }
        pricingExtra={
          <Fragment key="pricing-extra">
            {/* Whole-order items only exist on an Order converted from an accepted Quotation (convertQuotationToOrder copies the Quotation's frozen item snapshots); the order form has no picker for them, so this read-only recap is where they show. */}
            {showPrices && order.items.length > 0 && (
              <section className="flex flex-col gap-2 rounded-lg border border-border p-4">
                <h2 className="text-sm font-semibold">Carried over from the original Quotation</h2>
                <div className="flex flex-col gap-1.5">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span>{item.name}</span>
                        <span className="text-muted-foreground">× {item.quantity}</span>
                      </div>
                      <span className="font-medium">{inrPlain(Number(item.unitPrice) * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </Fragment>
        }
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email }))}
        eventTypes={eventTypes.filter((t) => t.isActive || t.id === order.eventTypeId).map((t) => ({ id: t.id, name: t.name }))}
        menus={menuOptionsFor(menus.filter((m) => m.isActive), showPrices)}
        carriedOverItemsSubtotal={showPrices ? order.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0) : 0}
        showPrices={showPrices}
        expensesTab={
          canViewExpenses ? (
            <ExpensesCard
              key="expenses"
              orderId={order.id}
              profitability={
                prices.profitability
                  ? computeProfitability(
                      orderTotal,
                      expenses.map((e) => ({ category: e.category, amount: Number(e.amount) })),
                      stockCost.cost,
                    )
                  : null
              }
              expenses={expenses.map((e) => ({
                id: e.id,
                orderId: e.orderId,
                category: e.category,
                amount: Number(e.amount),
                spentAt: e.spentAt.toISOString(),
                paymentMethod: e.paymentMethod,
                supplierName: e.supplierName,
                supplierId: e.supplierId,
                notes: e.notes,
                attachments: e.attachments,
              }))}
              suppliers={supplierOptions}
              inventoryUnknownQuantity={stockCost.unknownQuantity}
              canCreate={canCreateExpense}
              canEdit={canEditExpense}
              canDelete={canDeleteExpense}
            />
          ) : undefined
        }
        staffingTab={canViewStaffing && event ? <EventOps key="staffing" organizationId={organizationId} eventId={event.id} orderId={order.id} /> : canViewStaffing ? <p key="staffing" className="text-sm text-muted-foreground">Choose an event type on the order to create its event. Staff, tasks and logistics belong to the event.</p> : undefined}
        inventoryTab={
          orderInventory ? (
            <OrderInventoryPanel
              key="inventory"
              orderId={order.id}
              canEdit={canTakeStock}
              showCosts={prices.supplierCosts}
              data={prices.supplierCosts ? orderInventory : { ...orderInventory, lines: orderInventory.lines.map((l) => ({ ...l, sentCost: 0, sentCostUnknown: 0 })) }}
              extrasSlot={
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
          ) : undefined
        }
      />
    </div>
  );
}

const ORDER_KIND_LABEL_TEXT: Record<OrderKind, string> = { SINGLE: "Single Order", MULTI: "Multi Order" };

/**
 * The restricted view for a person with menus: approve and no orders: edit (Decision 6). It reads only what the view shows (see
 * ApprovalOnlyOrderView) and none of the payments, invoice, expense, staffing, inventory or customer-list loads of the full page.
 * The caller has already checked the permission, the business (every read below is scoped by it) and the location.
 */
async function approvalOnlyPage({ organizationId, orderId, activeEnabled, viewVersion, can, canMoveKitchenStage, showPrices }: { organizationId: string; orderId: string; activeEnabled: boolean; viewVersion: number | null; can: { editOrders: boolean; approveMenus: boolean }; canMoveKitchenStage: boolean; showPrices: boolean }) {
  const [order, menuApproval, statusHistory] = await Promise.all([
    getOrder(organizationId, orderId),
    getOrderMenuApproval(organizationId, orderId),
    listStatusChanges(organizationId, orderId, { subject: "ORDER" }),
  ]);
  if (!order) notFound();
  const selection = menuApproval ? await getMenuSelection(organizationId, menuApproval.menuSelectionId) : null;
  const review = selection ? await loadMenuApprovalReviewData(organizationId, selection, { viewVersion, showPrices }) : null;
  const event = order.events[0] ?? null;
  return (
    <ApprovalOnlyOrderView
      order={{
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        customerName: order.customer.name,
        orderKindLabel: ORDER_KIND_LABEL_TEXT[order.orderKind],
        multiOrder: order.orderKind === "MULTI",
        eventTypeName: order.eventType?.name ?? null,
        eventDateText: formatEventDates(order.eventStartDate, order.eventEndDate),
        startDateText: order.eventStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
        venue: order.venue,
        mealCount: order.mealPlanEntries.length,
        guests: {
          total: order.totalParticipants ?? 0,
          adults: order.adultCount ?? 0,
          below5: order.childBelow5Count ?? 0,
          from5to10: order.child5To10Count ?? 0,
        },
        kitchenName: event?.assignedKitchen?.name ?? null,
        showKitchen: activeEnabled,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        statusHint: getOrderStatusHint(order.status, menuApproval ? [menuApproval.kitchenProductionStatus] : []),
        statusHistory: statusHistory.map((c) => ({
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
      }}
      approval={review ? { ...review, capabilities: approvalCapabilities(can) } : null}
      notStarted={{ orderId: order.id, ...notStartedState(order, can) }}
      canApprove={can.approveMenus}
      kitchenStage={canMoveKitchenStage && menuApproval?.status === "FINAL_LOCKED" ? { menuSelectionId: menuApproval.menuSelectionId, currentStage: menuApproval.kitchenProductionStatus } : null}
    />
  );
}
