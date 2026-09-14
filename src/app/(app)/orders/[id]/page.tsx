import { notFound } from "next/navigation";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getOrder } from "@/modules/orders/order";
import { listCustomers } from "@/modules/customers/customer";
import { listEventTypes } from "@/modules/events/event-type";
import { listMenus } from "@/modules/menus/menu";
import { listMenuItems } from "@/modules/menus/item";
import { listKitchens } from "@/modules/events/event";
import { prisma } from "@/lib/db";
import { EditOrderClient } from "./_components/edit-order-client";
import { DeleteOrderButton } from "./_components/delete-order-button";
import { OrderEventSection } from "./_components/order-event-section";
import type { OrderFormValues } from "../_components/order-form";

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["edit"] }, organizationId);
  const [order, customers, eventTypes, menus, menuItems, addOns, kitchens] = await Promise.all([
    getOrder(organizationId, id),
    listCustomers(organizationId),
    listEventTypes(organizationId),
    listMenus(organizationId),
    listMenuItems(organizationId, { isActive: true }),
    prisma.addOn.findMany({ where: { organizationId, isActive: true }, orderBy: { name: "asc" } }),
    listKitchens(organizationId),
  ]);
  if (!order) notFound();

  const initialValues: OrderFormValues = {
    customerId: order.customerId,
    eventTypeId: order.eventTypeId ?? "",
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
    })),
  };

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Order for {order.customer.name}</h1>
          <p className="text-sm text-muted-foreground">
            {order.eventStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
        <DeleteOrderButton orderId={order.id} name={order.customer.name} />
      </div>

      <EditOrderClient
        orderId={order.id}
        initialValues={initialValues}
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        eventTypes={eventTypes.filter((t) => t.isActive || t.id === order.eventTypeId).map((t) => ({ id: t.id, name: t.name }))}
        menus={menus.filter((m) => m.isActive).map((m) => ({ id: m.id, name: m.name, price: Number(m.pricePerPlate) }))}
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
        }))}
        eventTypes={eventTypes.filter((t) => t.isActive).map((t) => ({ id: t.id, name: t.name }))}
        kitchens={kitchens.map((k) => ({ id: k.id, name: k.name }))}
      />
    </div>
  );
}
