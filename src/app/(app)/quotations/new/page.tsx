import type { Metadata } from "next";
import { requireActiveOrganization, requirePermission, hasPermission, canSee } from "@/lib/auth/require-session";
import { menuOptionsFor } from "@/modules/roles/redact";
import { listCustomers } from "@/modules/customers/customer";
import { listEventTypes } from "@/modules/events/event-type";
import { listMenus } from "@/modules/menus/menu";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { NewQuotationClient } from "./_components/new-quotation-client";

export const metadata: Metadata = {
  title: "New Quotation — Caterly",
  robots: { index: false, follow: false },
};


export default async function NewQuotationPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["create"] }, organizationId);
  const [customers, eventTypes, menus, canBypassDateRestriction, showPrices] = await Promise.all([
    listCustomers(organizationId),
    listEventTypes(organizationId),
    listMenus(organizationId),
    hasPermission({ orders: ["bypass_date_restriction"] }, organizationId),
    canSee("orderPrices", organizationId),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <NewQuotationClient
        header={
          <div className="flex flex-col gap-4">
            <PageBreadcrumb items={[{ label: "Quotations", href: "/quotations" }, { label: "Create Quotation" }]} />
            <div>
              <h1 className="text-2xl font-semibold">Create Quotation</h1>
              <p className="text-sm text-muted-foreground">A priced proposal you can send to a customer for digital approval.</p>
            </div>
          </div>
        }
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        eventTypes={eventTypes.filter((t) => t.isActive).map((t) => ({ id: t.id, name: t.name }))}
        menus={menuOptionsFor(menus.filter((m) => m.isActive), showPrices)}
        showPrices={showPrices}
        canBypassDateRestriction={canBypassDateRestriction}
      />
    </div>
  );
}
