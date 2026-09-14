import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listCustomers } from "@/modules/customers/customer";
import { listEventTypes } from "@/modules/events/event-type";
import { listMenus } from "@/modules/menus/menu";
import { listMenuItems } from "@/modules/menus/item";
import { prisma } from "@/lib/db";
import { NewQuotationClient } from "./_components/new-quotation-client";

export default async function NewQuotationPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["create"] }, organizationId);
  const [customers, eventTypes, menus, menuItems, addOns] = await Promise.all([
    listCustomers(organizationId),
    listEventTypes(organizationId),
    listMenus(organizationId),
    listMenuItems(organizationId, { isActive: true }),
    prisma.addOn.findMany({ where: { organizationId, isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div>
        <h1 className="text-lg font-semibold">Create Quotation</h1>
        <p className="text-sm text-muted-foreground">A priced proposal you can send to a customer for digital approval.</p>
      </div>
      <NewQuotationClient
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        eventTypes={eventTypes.filter((t) => t.isActive).map((t) => ({ id: t.id, name: t.name }))}
        menus={menus.filter((m) => m.isActive).map((m) => ({ id: m.id, name: m.name, price: Number(m.pricePerPlate) }))}
        menuItems={menuItems.map((i) => ({ id: i.id, name: i.name, price: Number(i.price) }))}
        addOns={addOns.map((a) => ({ id: a.id, name: a.name, price: Number(a.price) }))}
      />
    </div>
  );
}
