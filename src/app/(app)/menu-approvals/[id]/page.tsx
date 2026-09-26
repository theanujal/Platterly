import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Circle, Clock, TriangleAlert, Check, Lock } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getMenuSelection } from "@/modules/menu-approvals/menu-approval";
import { getActiveApprovalUrl } from "@/modules/menu-approvals/approval-link";
import { listStorefrontMenus, listCustomMenuSections, type StorefrontMenuSection } from "@/modules/menus/menu";
import { Badge } from "@/components/ui/badge";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { MenuApprovalReview } from "./_components/menu-approval-review";
import { MENU_SELECTION_STATUS_LABEL, MENU_SELECTION_STATUS_TONE } from "@/modules/orders/order-status";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Menu Approval — Platterly",
  robots: { index: false, follow: false },
};

const STATUS_LABEL = MENU_SELECTION_STATUS_LABEL;

// Shared neutral/info/warning/success legend (modules/orders/order-status.ts) — one vocabulary across the queue, this page and the Order page.
const STATUS_VARIANT = MENU_SELECTION_STATUS_TONE;

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
  const approvalUrl = await getActiveApprovalUrl(organizationId, menuSelection.id);

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
          createdAt: version.createdAt,
          sentAt: version.sentAt,
          superseded: version.supersededAt !== null,
          items: version.items.map((item) => ({ name: item.name })),
        }))}
        currentVersion={menuSelection.currentVersion}
        approvalUrl={approvalUrl}
        statusLabel={STATUS_LABEL[menuSelection.status]}
      />
    </div>
  );
}
