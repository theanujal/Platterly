import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Circle, Clock, TriangleAlert, Check, Lock } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getMenuSelection } from "@/modules/menu-approvals/menu-approval";
import { listStorefrontMenus, listCustomMenuSections, type StorefrontMenuSection } from "@/modules/menus/menu";
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

// Kept in sync with the same legend in ../page.tsx (AJ, 2026-09-19) — was
// hardcoded "outline" for every status here, unlike the queue page.
const STATUS_VARIANT: Record<MenuSelectionStatus, "neutral" | "info" | "warning" | "success"> = {
  DRAFT: "neutral",
  SENT_TO_CUSTOMER: "info",
  CUSTOMER_REVIEWING: "info",
  CHANGES_REQUESTED: "warning",
  CUSTOMER_APPROVED: "success",
  KITCHEN_REVIEWING: "info",
  KITCHEN_CHANGES_REQUESTED: "warning",
  KITCHEN_APPROVED: "success",
  FINAL_LOCKED: "success",
};

const STATUS_ICON = {
  DRAFT: Circle,
  SENT_TO_CUSTOMER: Clock,
  CUSTOMER_REVIEWING: Clock,
  CHANGES_REQUESTED: TriangleAlert,
  CUSTOMER_APPROVED: Check,
  KITCHEN_REVIEWING: Clock,
  KITCHEN_CHANGES_REQUESTED: TriangleAlert,
  KITCHEN_APPROVED: Check,
  FINAL_LOCKED: Lock,
} satisfies Record<MenuSelectionStatus, typeof Circle>;

export default async function MenuApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);

  const menuSelection = await getMenuSelection(organizationId, id);
  if (!menuSelection) notFound();

  const StatusIcon = STATUS_ICON[menuSelection.status];

  // What the kitchen can add/remove from: the Menu the customer chose, the
  // open dish list for a Custom Menu, or (older selections that predate the
  // Chunk 12 flow, with no chosen menu) every menu for the event type.
  const preference = menuSelection.event.order?.menuPreference ?? undefined;
  let groups: { key: string; name: string; sections: StorefrontMenuSection[] }[];
  if (menuSelection.isCustomMenu) {
    groups = [{ key: "custom", name: "Custom Menu", sections: await listCustomMenuSections(organizationId, preference ?? "NON_VEGETARIAN") }];
  } else if (menuSelection.chosenMenuId) {
    const menu = (await listStorefrontMenus(organizationId)).find((m) => m.id === menuSelection.chosenMenuId);
    groups = menu ? [{ key: menu.id, name: menu.name, sections: menu.sections }] : [];
  } else {
    const menus = await listStorefrontMenus(organizationId, { eventTypeId: menuSelection.event.eventTypeId, menuType: preference });
    groups = menus.map((m) => ({ key: m.id, name: m.name, sections: m.sections }));
  }

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
        <Badge variant={STATUS_VARIANT[menuSelection.status]}>
          <StatusIcon data-icon="inline-start" />
          {STATUS_LABEL[menuSelection.status]}
        </Badge>
      </div>

      <MenuApprovalReview
        menuSelectionId={menuSelection.id}
        status={menuSelection.status}
        customerRequestNote={menuSelection.customerRequestNote}
        kitchenRequestNote={menuSelection.kitchenRequestNote}
        lockedAt={menuSelection.lockedAt}
        groups={groups}
        isCustomMenu={menuSelection.isCustomMenu}
        chosenMenuName={menuSelection.chosenMenu?.name ?? null}
        guests={menuSelection.event.order?.totalParticipants ?? 0}
        customPricePerPlate={menuSelection.customPricePerPlate ? Number(menuSelection.customPricePerPlate) : null}
        initialItems={menuSelection.items.map((item) => ({
          itemType: item.itemType,
          catalogId: item.menuId ?? item.menuItemId ?? item.addOnId ?? "",
          name: item.name,
          isExtra: item.isExtra,
        }))}
        versions={menuSelection.versions.map((version) => ({
          versionNumber: version.versionNumber,
          status: version.status,
          createdAt: version.createdAt,
          items: version.items.map((item) => ({ name: item.name })),
        }))}
      />
    </div>
  );
}
