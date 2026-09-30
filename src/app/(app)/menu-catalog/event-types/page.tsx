import type { Metadata } from "next";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listEventTypes } from "@/modules/events/event-type";
import { listMenus } from "@/modules/menus/menu";
import { getEventTypeIcon } from "@/lib/event-type-icons";
import { TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { CatalogBrowser, type CatalogEntry } from "@/components/catalog/catalog-browser";
import { ActiveBadge, CATALOG_GRID_CLASSNAME, CatalogCardBody, CatalogCardMedia, CatalogNameCell } from "@/components/catalog/catalog-display";
import { AddEventTypeDrawer } from "./_components/add-event-type-drawer";
import { EventTypeCardActions } from "./_components/event-type-card-actions";
import type { EventTypeFormValues } from "./_components/event-type-form";
import { EventTypeReorderButtons } from "./_components/event-type-reorder-buttons";

export const metadata: Metadata = {
  title: "Event Types — Platterly",
  robots: { index: false, follow: false },
};

export default async function EventTypesPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["view"] }, organizationId);
  const [eventTypes, menus] = await Promise.all([listEventTypes(organizationId), listMenus(organizationId)]);
  const availableMenus = menus.map((m) => ({ id: m.id, name: m.name }));
  const orderedIds = eventTypes.map((e) => e.id);

  const entries: CatalogEntry[] = eventTypes.map((eventType) => {
    const Icon = getEventTypeIcon(eventType.icon);
    const initialValues: EventTypeFormValues = {
      name: eventType.name,
      description: eventType.description ?? "",
      imageUrl: eventType.image,
      minGuests: eventType.minGuests?.toString() ?? "",
      isActive: eventType.isActive,
      icon: eventType.icon ?? "other",
      menuIds: eventType.menus.map((m) => m.menuId),
    };
    return {
      id: eventType.id,
      searchText: `${eventType.name} ${eventType.description ?? ""}`,
      filterValues: { status: eventType.isActive ? "ACTIVE" : "INACTIVE" },
      card: (
        <>
          <CatalogCardMedia
            src={eventType.image}
            icon={Icon}
            overlay={<EventTypeCardActions eventTypeId={eventType.id} name={eventType.name} initialValues={initialValues} availableMenus={availableMenus} />}
          />
          <CatalogCardBody
            title={eventType.name}
            titleIcon={Icon}
            description={eventType.description}
            footer={<span className="text-sm text-muted-foreground">{eventType.minGuests != null ? `Min ${eventType.minGuests} guests` : "No guest minimum"}</span>}
            active={eventType.isActive}
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
            <div className="flex items-center justify-end gap-1">
              <EventTypeReorderButtons orderedIds={orderedIds} eventTypeId={eventType.id} />
              <EventTypeCardActions eventTypeId={eventType.id} name={eventType.name} initialValues={initialValues} availableMenus={availableMenus} variant="plain" />
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
        <AddEventTypeDrawer availableMenus={availableMenus} />
      </div>
      <Separator />

      <CatalogBrowser
        entries={entries}
        defaultView="list"
        addTile={<AddEventTypeDrawer availableMenus={availableMenus} variant="tile" />}
        columns={["Event Type", "Min Guests", "Status", "Actions"]}
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
