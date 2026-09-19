import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { listCustomers } from "@/modules/customers/customer";
import { listEventTypes } from "@/modules/events/event-type";
import { listMenus } from "@/modules/menus/menu";
import { NewOrderClient } from "./_components/new-order-client";

export default async function NewOrderPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["create"] }, organizationId);
  const [customers, eventTypes, menus, canBypassDateRestriction] = await Promise.all([
    listCustomers(organizationId),
    listEventTypes(organizationId),
    listMenus(organizationId),
    hasPermission({ orders: ["bypass_date_restriction"] }, organizationId),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div>
        <h1 className="text-lg font-semibold">Create Order</h1>
        <p className="text-sm text-muted-foreground">Customer, event details, guests, meal planning, and venue — all in one order.</p>
      </div>
      <NewOrderClient
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        eventTypes={eventTypes.filter((t) => t.isActive).map((t) => ({ id: t.id, name: t.name }))}
        menus={menus
          .filter((m) => m.isActive)
          .map((m) => ({
            id: m.id,
            name: m.name,
            price: Number(m.pricePerPlate),
            childUnder5Chargeable: m.childUnder5Chargeable,
            childUnder5Price: m.childUnder5Price !== null ? Number(m.childUnder5Price) : null,
            child5To10PricingType: m.child5To10PricingType,
            child5To10PriceValue: m.child5To10PriceValue !== null ? Number(m.child5To10PriceValue) : null,
          }))}
        canBypassDateRestriction={canBypassDateRestriction}
      />
    </div>
  );
}
