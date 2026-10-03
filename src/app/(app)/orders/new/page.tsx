import type { Metadata } from "next";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listCustomers } from "@/modules/customers/customer";
import { listEventTypes } from "@/modules/events/event-type";
import { listMenus } from "@/modules/menus/menu";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { NewOrderClient } from "./_components/new-order-client";

export const metadata: Metadata = {
  title: "New Order — Platterly",
  robots: { index: false, follow: false },
};


export default async function NewOrderPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["create"] }, organizationId);
  const [customers, eventTypes, menus] = await Promise.all([
    listCustomers(organizationId),
    listEventTypes(organizationId),
    listMenus(organizationId),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <NewOrderClient
        header={
          <div className="flex flex-col gap-4">
            <PageBreadcrumb items={[{ label: "Orders", href: "/orders" }, { label: "Create Order" }]} />
            <div>
              <h1 className="text-2xl font-semibold">Create Order</h1>
              <p className="text-sm text-muted-foreground">Add all the details for the new catering order. You can edit and update this anytime.</p>
            </div>
          </div>
        }
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email }))}
        eventTypes={eventTypes.filter((t) => t.isActive).map((t) => ({ id: t.id, name: t.name }))}
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
      />
    </div>
  );
}
