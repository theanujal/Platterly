import { notFound } from "next/navigation";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getOrder } from "@/modules/orders/order";
import { listCustomers } from "@/modules/customers/customer";
import { listEventTypes } from "@/modules/events/event-type";
import { listMenus, listMenuItemsByMenu } from "@/modules/menus/menu";
import { listMenuItems } from "@/modules/menus/item";
import { listKitchens } from "@/modules/events/event";
import { listInventoryItems } from "@/modules/inventory/inventory";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { EditOrderClient } from "./_components/edit-order-client";
import { DeleteOrderButton } from "./_components/delete-order-button";
import { OrderEventSection } from "./_components/order-event-section";
import type { OrderFormValues } from "../_components/order-form";
import type { OrderKind } from "@/generated/prisma/enums";

const ORDER_KIND_LABEL: Record<OrderKind, string> = {
  SINGLE: "Single Order",
  MULTI: "Multi Order",
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["edit"] }, organizationId);
  const [order, customers, eventTypes, menus, menuItemsByMenu, menuItems, addOns, kitchens, inventoryItems] = await Promise.all([
    getOrder(organizationId, id),
    listCustomers(organizationId),
    listEventTypes(organizationId),
    listMenus(organizationId),
    listMenuItemsByMenu(organizationId),
    listMenuItems(organizationId, { isActive: true }),
    prisma.addOn.findMany({ where: { organizationId, isActive: true }, orderBy: { name: "asc" } }),
    listKitchens(organizationId),
    listInventoryItems(organizationId),
  ]);
  if (!order) notFound();

  const initialValues: OrderFormValues = {
    customerId: order.customerId,
    eventTypeId: order.eventTypeId ?? "",
    orderKind: order.orderKind,
    eventStartDate: toDateInputValue(order.eventStartDate),
    eventEndDate: toDateInputValue(order.eventEndDate),
    venue: order.venue ?? "",
    eventAddress: order.eventAddress ?? "",
    adultCount: order.adultCount?.toString() ?? "",
    childCount: order.childCount?.toString() ?? "",
    totalParticipants: order.totalParticipants?.toString() ?? "",
    adultNonVegCount: order.adultNonVegCount?.toString() ?? "",
    adultVegCount: order.adultVegCount?.toString() ?? "",
    individualPricingEnabled: order.individualPricingEnabled,
    discount: order.discount.toString(),
    taxes: order.taxes.toString(),
    advance: order.advance.toString(),
    paymentStatus: order.paymentStatus,
    status: order.status,
    notes: order.notes ?? "",
    items: order.items.map((item) => ({
      key: item.id,
      itemType: item.itemType,
      catalogId: item.menuId ?? item.menuItemId ?? item.addOnId ?? "",
      name: item.name,
      unitPrice: Number(item.unitPrice),
      quantity: item.quantity,
    })),
    mealPlanEntries: order.mealPlanEntries.map((entry) => ({
      date: toDateInputValue(entry.date),
      mealType: entry.mealType,
      price: entry.price?.toString() ?? "",
      menuId: entry.menuId ?? "",
      items: entry.items.map((item) => ({
        key: item.id,
        catalogId: item.menuItemId ?? "",
        name: item.name,
        unitPrice: Number(item.unitPrice),
        quantity: item.quantity,
      })),
    })),
  };

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{order.orderNumber ?? "Order"}</p>
          <h1 className="text-lg font-semibold">Order for {order.customer.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary">{ORDER_KIND_LABEL[order.orderKind]}</Badge>
            <p className="text-sm text-muted-foreground">
              {order.eventStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
        </div>
        <DeleteOrderButton orderId={order.id} name={order.customer.name} />
      </div>

      <EditOrderClient
        orderId={order.id}
        initialValues={initialValues}
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        eventTypes={eventTypes.filter((t) => t.isActive || t.id === order.eventTypeId).map((t) => ({ id: t.id, name: t.name }))}
        menus={menus.filter((m) => m.isActive).map((m) => ({ id: m.id, name: m.name, price: Number(m.pricePerPlate) }))}
        menuItemsByMenu={menuItemsByMenu}
        menuItems={menuItems.map((i) => ({ id: i.id, name: i.name, price: Number(i.price) }))}
        addOns={addOns.map((a) => ({ id: a.id, name: a.name, price: Number(a.price) }))}
      />

      <OrderEventSection
        orderId={order.id}
        events={order.events.map((e) => ({
          id: e.id,
          eventTypeId: e.eventTypeId,
          assignedKitchenId: e.assignedKitchenId,
          guestCount: e.guestCount,
          venue: e.venue,
          status: e.status,
          name: e.name,
          startDate: toDateInputValue(e.startDate),
          endDate: toDateInputValue(e.endDate),
          notes: e.notes ?? "",
          requiredInventory: e.requiredInventory.map((r) => ({ inventoryId: r.inventoryId, quantity: Number(r.quantity) })),
        }))}
        eventTypes={eventTypes.filter((t) => t.isActive).map((t) => ({ id: t.id, name: t.name }))}
        kitchens={kitchens.map((k) => ({ id: k.id, name: k.name }))}
        inventoryItems={inventoryItems.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))}
      />
    </div>
  );
}
