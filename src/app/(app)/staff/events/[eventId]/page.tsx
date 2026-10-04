import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { assertKitchenAtMyLocation } from "@/modules/locations/active-location";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { EventOps } from "../../_components/event-ops";

export const metadata: Metadata = {
  title: "Event Staffing — Platterly",
  robots: { index: false, follow: false },
};

/** Where the kitchen team staffs one event. They cannot open the order itself, so this stands on its own. */
export default async function EventStaffingPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ staffing: ["view"] }, organizationId);
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId },
    include: { order: { select: { id: true, orderNumber: true } }, customer: { select: { name: true } } },
  });
  if (!event) notFound();
  await assertKitchenAtMyLocation(organizationId, session.user.id, event.assignedKitchenId);

  const dates = event.startDate.getTime() === event.endDate.getTime() ? [event.startDate] : [event.startDate, event.endDate];
  const when = dates.map((d) => d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })).join(" to ");

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Staff", href: "/staff" }, { label: event.order?.orderNumber ?? event.name }]} />
      <div>
        <h1 className="text-2xl font-semibold">
          {event.order?.orderNumber ? `${event.order.orderNumber} · ` : ""}
          {event.customer.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {when}
          {event.guestCount ? ` · ${event.guestCount} guests` : ""}
          {event.venue ? ` · ${event.venue}` : ""}
        </p>
      </div>
      <Separator />
      <EventOps organizationId={organizationId} eventId={event.id} orderId={event.order?.id ?? null} />
    </div>
  );
}
