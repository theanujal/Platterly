import type { Metadata } from "next";
import { CalendarRange } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listEventTypes } from "@/modules/events/event-type";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry } from "@/components/catalog/catalog-browser";

export const metadata: Metadata = {
  title: "Events — Platterly",
  robots: { index: false, follow: false },
};

export default async function EventsPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["view"] }, organizationId);
  const eventTypes = await listEventTypes(organizationId);

  const entries: CatalogEntry[] = eventTypes.map((eventType) => ({
    id: eventType.id,
    href: `/events/${eventType.id}`,
    searchText: `${eventType.name} ${eventType.description ?? ""}`,
    card: (
      <>
        {eventType.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={eventType.image} alt="" className="aspect-video w-full object-cover" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-muted">
            <CalendarRange className="size-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex flex-col gap-1.5 p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium">{eventType.name}</span>
            {!eventType.isActive && <Badge variant="secondary">Inactive</Badge>}
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
        <TableCell className="font-medium">{eventType.name}</TableCell>
        <TableCell className="text-muted-foreground">{eventType.minGuests ?? "—"}</TableCell>
        <TableCell>
          <Badge variant={eventType.isActive ? "default" : "secondary"}>{eventType.isActive ? "Active" : "Inactive"}</Badge>
        </TableCell>
      </>
    ),
  }));

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <div>
        <h1 className="text-xl font-semibold">Events</h1>
        <p className="text-sm text-muted-foreground">The types of events you cater — e.g. Wedding, Corporate Lunch.</p>
      </div>

      <CatalogBrowser
        entries={entries}
        newHref="/events/new"
        newLabel="Add New Event"
        searchPlaceholder="Search events…"
        emptyLabel="No events yet."
        listColumnCount={3}
      />
    </div>
  );
}
