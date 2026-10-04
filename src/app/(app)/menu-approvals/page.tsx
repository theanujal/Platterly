import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, ChefHat, Circle, Clock, TriangleAlert, Check, Lock, User } from "lucide-react";
import { getActiveLocation } from "@/modules/locations/active-location";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listMenuSelectionsForKitchen } from "@/modules/menu-approvals/menu-approval";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { CATALOG_GRID_CLASSNAME } from "@/components/catalog/catalog-display";
import { MenuApprovalsFilterBar } from "./_components/menu-approvals-filter-bar";
import { MENU_SELECTION_STATUS_LABEL, MENU_SELECTION_STATUS_TONE } from "@/modules/orders/order-status";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";
import type { LucideIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Menu Approvals — Platterly",
  robots: { index: false, follow: false },
};

const STATUS_LABEL = MENU_SELECTION_STATUS_LABEL;

// Shared neutral/info/warning/success legend (modules/orders/order-status.ts) — one vocabulary across the queue, this page and the Order page.
const STATUS_VARIANT = MENU_SELECTION_STATUS_TONE;

const STATUS_ICON: Record<MenuSelectionStatus, LucideIcon> = {
  DRAFT: Circle,
  SENT_TO_CUSTOMER: Clock,
  CUSTOMER_REVIEWING: Clock,
  CHANGES_REQUESTED: TriangleAlert,
  CUSTOMER_APPROVED: Check,
  FINAL_LOCKED: Lock,
};

function formatDate(date: Date) {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

interface MenuApprovalsPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function MenuApprovalsPage({ searchParams }: MenuApprovalsPageProps) {
  const { organizationId, session } = await requireActiveOrganization();
  const { locationId } = await getActiveLocation(organizationId, session.user.id);
  await requirePermission({ menus: ["approve"] }, organizationId);
  const { status } = await searchParams;
  const validStatus = status && status in STATUS_LABEL ? (status as MenuSelectionStatus) : undefined;

  const menuSelections = await listMenuSelectionsForKitchen(organizationId, validStatus ? [validStatus] : undefined, locationId);

  const entries: CatalogEntry[] = menuSelections.map((menuSelection) => {
    const StatusIcon = STATUS_ICON[menuSelection.status];
    const customerName = menuSelection.event.customer.name;
    const reviewHref = `/menu-approvals/${menuSelection.id}`;
    const statusBadge = (
      <Badge variant={STATUS_VARIANT[menuSelection.status]}>
        <StatusIcon data-icon="inline-start" />
        {STATUS_LABEL[menuSelection.status]}
      </Badge>
    );

    return {
      id: menuSelection.id,
      href: reviewHref,
      cardOwnsLink: true,
      searchText: `${customerName} ${menuSelection.event.name} ${menuSelection.event.assignedKitchen?.name ?? ""}`,
      sortValues: {
        updated: menuSelection.updatedAt.getTime(),
        eventDate: menuSelection.event.startDate.getTime(),
        customer: customerName,
      },
      // The whole card is one stretched link to the review page (after:inset-0), like the Orders card.
      card: (
        <div className="relative flex flex-1 flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {statusBadge}
            <span className="text-xs text-muted-foreground">Updated {formatDate(menuSelection.updatedAt)}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="size-5" />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <Link
                href={reviewHref}
                className="truncate text-base font-semibold outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
              >
                {customerName}
              </Link>
              <span className="truncate text-sm text-muted-foreground">{menuSelection.event.name}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0" />
              {formatDate(menuSelection.event.startDate)}
            </span>
            <span className="flex items-center gap-2">
              <ChefHat className="size-4 shrink-0" />
              {menuSelection.event.assignedKitchen?.name ?? "No kitchen assigned"}
            </span>
          </div>
          <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-sm font-medium text-primary">
            Review menu
            <ArrowRight className="size-4" />
          </div>
        </div>
      ),
      listRow: (
        <>
          <TableCell className="px-3 py-3">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="size-5" />
              </span>
              <span className="max-w-56 truncate font-semibold">{customerName}</span>
            </div>
          </TableCell>
          <TableCell className="px-3 py-3 text-sm">{menuSelection.event.name}</TableCell>
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">{formatDate(menuSelection.event.startDate)}</TableCell>
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">{menuSelection.event.assignedKitchen?.name ?? "—"}</TableCell>
          <TableCell className="px-3 py-3">{statusBadge}</TableCell>
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">{formatDate(menuSelection.updatedAt)}</TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex justify-end">
              <Button size="md" variant="outline" render={<Link href={reviewHref} />} nativeButton={false}>
                Review
              </Button>
            </div>
          </TableCell>
        </>
      ),
    };
  });

  const sortOptions: CatalogSortOption[] = [
    { value: "updated", label: "Recent First", key: "updated", direction: "desc" },
    { value: "event-date", label: "Event Date (Soonest)", key: "eventDate" },
    { value: "customer", label: "Customer (A–Z)", key: "customer" },
  ];

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Menu Approvals" }]} />
      <div>
        <h1 className="text-2xl font-semibold">Menu Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Every customer&apos;s menu selection, from kitchen review through to a final, locked menu.
        </p>
      </div>
      <Separator />

      <CatalogBrowser
        entries={entries}
        columns={["Customer", "Event", "Event Date", "Kitchen", "Status", "Updated", "Action"]}
        richList
        gridColumnsClassName={CATALOG_GRID_CLASSNAME}
        searchPlaceholder="Search customer or event…"
        emptyLabel="No menu selections yet."
        filters={<MenuApprovalsFilterBar />}
        sortOptions={sortOptions}
        pageSize={16}
        defaultView="list"
      />
    </div>
  );
}
