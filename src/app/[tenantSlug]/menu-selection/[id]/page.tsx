import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedTenantBySlug } from "@/modules/tenants/tenant";
import { getMenuSelection } from "@/modules/menu-approvals/menu-approval";
import { listStorefrontMenus } from "@/modules/menus/menu";
import { MenuSelectionForm } from "./_components/menu-selection-form";

interface MenuSelectionPageProps {
  params: Promise<{ tenantSlug: string; id: string }>;
}

export async function generateMetadata({ params }: MenuSelectionPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const organization = await getPublishedTenantBySlug(tenantSlug);
  if (!organization) return {};
  return { title: `Select Your Menu — ${organization.name}`, robots: { index: false, follow: false } };
}

// The statuses in which this page still shows the editable selection form.
// Anything else (DRAFT/SENT_TO_CUSTOMER are transient and auto-advanced
// past instantly; CUSTOMER_APPROVED and beyond means it's already
// submitted) shows the static locked message below instead — per AJ's rule
// that the customer has no further view/edit access once submitted.
const EDITABLE_STATUSES = ["CUSTOMER_REVIEWING", "CHANGES_REQUESTED"];

export default async function MenuSelectionPage({ params }: MenuSelectionPageProps) {
  const { tenantSlug, id } = await params;
  const organization = await getPublishedTenantBySlug(tenantSlug);
  if (!organization) notFound();

  const menuSelection = await getMenuSelection(organization.id, id);
  if (!menuSelection) notFound();

  if (!EDITABLE_STATUSES.includes(menuSelection.status)) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Thanks — we&apos;ve received your details</h1>
        <p className="text-sm text-muted-foreground">
          Our team will follow up with you shortly over WhatsApp or email to finalize your menu.
        </p>
      </main>
    );
  }

  const menus = await listStorefrontMenus(organization.id, {
    eventTypeId: menuSelection.event.eventTypeId,
    menuType: menuSelection.event.order?.menuPreference ?? undefined,
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 md:px-8">
      <header className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold">Select Your Menu</h1>
        <p className="text-sm text-muted-foreground">
          For {menuSelection.event.name} — {menuSelection.event.customer.name}
        </p>
      </header>

      <MenuSelectionForm
        tenantSlug={tenantSlug}
        menuSelectionId={menuSelection.id}
        menus={menus}
        initialItems={menuSelection.items.map((item) => ({
          itemType: item.itemType,
          catalogId: item.menuId ?? item.menuItemId ?? item.addOnId ?? "",
          quantity: item.quantity,
        }))}
      />
    </main>
  );
}
