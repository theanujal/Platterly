import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, Plus, Settings2 } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listEvents, listKitchens } from "@/modules/events/event";
import { getEventTypeIcon } from "@/lib/event-type-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EventsFilterBar } from "./_components/events-filter-bar";
import type { EventStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Events — Platterly",
  robots: { index: false, follow: false },
};

const STATUS_VARIANT: Record<EventStatus, "default" | "secondary" | "outline" | "destructive"> = {
  PENDING: "secondary",
  PROCESSING: "default",
  COMPLETED: "outline",
  CANCELLED: "destructive",
};

const STATUS_LABEL: Record<EventStatus, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function formatDateRange(start: Date, end: Date) {
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return start.toDateString() === end.toDateString() ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

interface EventsPageProps {
  searchParams: Promise<{ search?: string; status?: string; kitchenId?: string }>;
}

// Chunk 9 Group 9.4 — the real Events Dashboard (Updated doc §9), distinct
// from Event Type management (moved to /events/types in this same round).
export default async function EventsPage({ searchParams }: EventsPageProps) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["view"] }, organizationId);
  const { search, status, kitchenId } = await searchParams;

  const validStatus = status && status in STATUS_LABEL ? (status as EventStatus) : undefined;

  const [events, kitchens] = await Promise.all([
    listEvents(organizationId, { search, status: validStatus, assignedKitchenId: kitchenId }),
    listKitchens(organizationId),
  ]);

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Events</h1>
          <p className="text-sm text-muted-foreground">Events are created by selecting a customer, event type, and required inventory.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" render={<Link href="/events/types" />} nativeButton={false}>
            <Settings2 className="size-4" />
            Manage Event Types
          </Button>
          <Button size="sm" render={<Link href="/events/new" />} nativeButton={false}>
            <Plus className="size-4" />
            Create Event
          </Button>
        </div>
      </div>

      <EventsFilterBar kitchens={kitchens.map((k) => ({ id: k.id, name: k.name }))} />

      {events.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No events yet. Events are created by selecting a customer, event type, and required inventory.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const Icon = getEventTypeIcon(event.eventType.icon);
            return (
              <Link key={event.id} href={`/events/${event.id}`} className="block">
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Icon className="size-4 text-muted-foreground" />
                        {event.name}
                      </span>
                      <Badge variant={STATUS_VARIANT[event.status]}>{STATUS_LABEL[event.status]}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{event.customer.name}</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarRange className="size-3.5" />
                      {formatDateRange(event.startDate, event.endDate)}
                    </div>
                    {event.venue && <p className="text-xs text-muted-foreground">{event.venue}</p>}
                    {event.assignedKitchen && (
                      <Badge variant="outline" className="w-fit">
                        {event.assignedKitchen.name}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
