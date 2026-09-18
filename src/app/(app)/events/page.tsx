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
      href: `/events/${eventType.id}`,
      searchText: `${eventType.name} ${eventType.description ?? ""}`,
      filterValues: { status: eventType.isActive ? "ACTIVE" : "INACTIVE" },
      card: (
        <>
          {eventType.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={eventType.image} alt="" className="aspect-video w-full object-cover" />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-muted">
              <Icon className="size-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex flex-col gap-1.5 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-1.5 font-medium">
                <Icon className="size-4 text-muted-foreground" />
                {eventType.name}
              </span>
              {!eventType.isActive && <Badge variant="neutral">Inactive</Badge>}
            </div>
            {eventType.description && <p className="line-clamp-2 text-xs text-muted-foreground">{eventType.description}</p>}
            {eventType.minGuests != null && (
              <span className="pt-1 text-xs text-muted-foreground">Min {eventType.minGuests} guests</span>
            )}
          </div>
        </>
      ),
      listRow: (
        <>
          <TableCell className="font-medium">
            <span className="flex items-center gap-1.5">
              <Icon className="size-4 text-muted-foreground" />
              {eventType.name}
            </span>
          </TableCell>
          <TableCell className="text-muted-foreground">{eventType.minGuests ?? "—"}</TableCell>
          <TableCell>
            <Badge variant={eventType.isActive ? "success" : "neutral"}>{eventType.isActive ? "Active" : "Inactive"}</Badge>
          </TableCell>
          <TableCell>
            <EventTypeReorderButtons orderedIds={orderedIds} eventTypeId={eventType.id} />
          </TableCell>
        </>
      ),
    };
  });

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Event Types" }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Event Types</h1>
          <p className="text-sm text-muted-foreground">The types of events you cater — e.g. Wedding, Corporate Lunch.</p>
        </div>
        <Button render={<Link href="/events/new" />} nativeButton={false}>
          <Plus className="size-4" />
          Add Event Type
        </Button>
      </div>
      <Separator />

      <CatalogBrowser
        entries={entries}
        addTile={
          <Link href="/events/new" className={CATALOG_ADD_TILE_CLASSNAME}>
            <CatalogAddTileContent label="Add New Event Type" description="e.g. Wedding, Corporate Lunch" />
          </Link>
        }
        columns={["Name", "Min Guests", "Status", "Reorder"]}
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
