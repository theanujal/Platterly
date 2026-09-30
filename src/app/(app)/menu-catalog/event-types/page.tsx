import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listEventTypes } from "@/modules/events/event-type";
import { getEventTypeIcon } from "@/lib/event-type-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { CatalogBrowser, type CatalogEntry, CATALOG_ADD_TILE_CLASSNAME, CatalogAddTileContent } from "@/components/catalog/catalog-browser";
import { ActiveBadge, CATALOG_GRID_CLASSNAME, CatalogCardBody, CatalogCardMedia, CatalogNameCell } from "@/components/catalog/catalog-display";
import { EventTypeReorderButtons } from "./_components/event-type-reorder-buttons";

export const metadata: Metadata = {
  title: "Event Types — Platterly",
  robots: { index: false, follow: false },
};

export default async function EventTypesPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["view"] }, organizationId);
  const eventTypes = await listEventTypes(organizationId);
  const orderedIds = eventTypes.map((e) => e.id);

  const entries: CatalogEntry[] = eventTypes.map((eventType) => {
    const Icon = getEventTypeIcon(eventType.icon);
    return {
      id: eventType.id,
      href: `/menu-catalog/event-types/${eventType.id}`,
      searchText: `${eventType.name} ${eventType.description ?? ""}`,
      filterValues: { status: eventType.isActive ? "ACTIVE" : "INACTIVE" },
      card: (
        <>
          <CatalogCardMedia src={eventType.image} icon={Icon} />
          <CatalogCardBody
            title={eventType.name}
            titleIcon={Icon}
            trailing={!eventType.isActive ? <Badge variant="neutral">Inactive</Badge> : undefined}
            description={eventType.description}
            footer={
              <>
                <span className="text-sm text-muted-foreground">{eventType.minGuests != null ? `Min ${eventType.minGuests} guests` : "No guest minimum"}</span>
                <ActiveBadge active={eventType.isActive} />
              </>
            }
          />
        </>
      ),
      listRow: (
        <>
          <TableCell className="px-3 py-3">
            <CatalogNameCell name={eventType.name} description={eventType.description} src={eventType.image} icon={Icon} />
          </TableCell>
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">{eventType.minGuests ?? "—"}</TableCell>
          <TableCell className="px-3 py-3">
            <ActiveBadge active={eventType.isActive} />
          </TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex justify-end">
              <EventTypeReorderButtons orderedIds={orderedIds} eventTypeId={eventType.id} />
            </div>
          </TableCell>
        </>
      ),
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Menu Catalog", href: "/menu-catalog" }, { label: "Event Types" }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Event Types</h1>
          <p className="text-sm text-muted-foreground">The types of events you cater — e.g. Wedding, Corporate Lunch.</p>
        </div>
        <Button render={<Link href="/menu-catalog/event-types/new" />} nativeButton={false}>
          <Plus className="size-4" />
          Add Event Type
        </Button>
      </div>
      <Separator />

      <CatalogBrowser
        entries={entries}
        addTile={
          <Link href="/menu-catalog/event-types/new" className={CATALOG_ADD_TILE_CLASSNAME}>
            <CatalogAddTileContent label="Add New Event Type" description="e.g. Wedding, Corporate Lunch" />
          </Link>
        }
        columns={["Event Type", "Min Guests", "Status", "Reorder"]}
        richList
        gridColumnsClassName={CATALOG_GRID_CLASSNAME}
        searchPlaceholder="Search event types…"
        emptyLabel="No event types yet."
        filterOptions={[
          {
            key: "status",
            allLabel: "Status",
            options: [
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
            ],
          },
        ]}
        pageSize={16}
      />
    </div>
  );
}
