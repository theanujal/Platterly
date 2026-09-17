import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getMenuSelection } from "@/modules/menu-approvals/menu-approval";
import { listStorefrontMenus } from "@/modules/menus/menu";
import { Badge } from "@/components/ui/badge";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { MenuApprovalReview } from "./_components/menu-approval-review";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Menu Approval — Platterly",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<MenuSelectionStatus, string> = {
  DRAFT: "Draft",
  SENT_TO_CUSTOMER: "Sent to Customer",
  CUSTOMER_REVIEWING: "Customer Reviewing",
  CHANGES_REQUESTED: "Changes Requested",
  CUSTOMER_APPROVED: "Customer Approved",
  KITCHEN_REVIEWING: "Needs Kitchen Review",
  KITCHEN_CHANGES_REQUESTED: "Kitchen Changes Requested",
  KITCHEN_APPROVED: "Kitchen Approved",
  FINAL_LOCKED: "Final / Locked",
};

export default async function MenuApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);

  const menuSelection = await getMenuSelection(organizationId, id);
  if (!menuSelection) notFound();

  const menus = await listStorefrontMenus(organizationId, {
    eventTypeId: menuSelection.event.eventTypeId,
    menuType: menuSelection.event.order?.menuPreference ?? undefined,
  });

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Menu Approvals", href: "/menu-approvals" }, { label: menuSelection.event.customer.name }]} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Menu Selection for {menuSelection.event.customer.name}</h1>
          <p className="text-sm text-muted-foreground">
            {menuSelection.event.name} · {menuSelection.event.eventType.name}
            {menuSelection.event.assignedKitchen ? ` · ${menuSelection.event.assignedKitchen.name}` : ""}
          </p>
        </div>
        <Badge variant="outline">{STATUS_LABEL[menuSelection.status]}</Badge>
      </div>

      <MenuApprovalReview
        menuSelectionId={menuSelection.id}
        status={menuSelection.status}
        customerRequestNote={menuSelection.customerRequestNote}
        kitchenRequestNote={menuSelection.kitchenRequestNote}
        lockedAt={menuSelection.lockedAt}
        menus={menus}
        initialItems={menuSelection.items.map((item) => ({
          itemType: item.itemType,
          catalogId: item.menuId ?? item.menuItemId ?? item.addOnId ?? "",
          quantity: item.quantity,
        }))}
        versions={menuSelection.versions.map((version) => ({
          versionNumber: version.versionNumber,
          status: version.status,
          createdAt: version.createdAt,
          items: version.items.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: Number(item.unitPrice) })),
        }))}
      />
    </div>
  );
}
