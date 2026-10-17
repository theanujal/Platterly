import { hasPermission } from "@/lib/auth/require-session";
import { listManagerSuggestions } from "@/modules/employees/assignment";
import { prisma } from "@/lib/db";
import { getStaffCounts } from "@/modules/employees/staff-counts";
import { getDeliveryAddress, getLogisticsSlots, listLogistics } from "@/modules/logistics/logistics";
import { StaffingCountsCard } from "./staffing-counts-card";
import { LogisticsCard, type LogisticsEntry } from "./logistics-card";

const toLocalInput = (d: Date | null) => (d ? d.toISOString().slice(0, 16) : "");

/**
 * Everything the kitchen team enters for one event, in one place: how many people per duty, and the dispatch and setup
 * details. Used by the event staffing page (which the kitchen role can open) and by the Staffing tab on the order.
 * Staffing and logistics notes live under Additional Details on the order, not here. An order with two or more events gets a logistics
 * record for each, and logistics opens once the order is sent to the kitchen.
 */
export async function EventOps({ organizationId, eventId, orderId }: { organizationId: string; eventId: string; orderId: string | null }) {
  const canEdit = await hasPermission({ staffing: ["edit"] }, organizationId);
  const [counts, event, suggestions, rows, address, { orderStatus, slots }] = await Promise.all([
    getStaffCounts(organizationId, eventId),
    prisma.event.findFirstOrThrow({ where: { id: eventId, organizationId }, select: { eventManagerName: true } }),
    listManagerSuggestions(organizationId),
    listLogistics(organizationId, eventId),
    getDeliveryAddress(organizationId, orderId),
    getLogisticsSlots(organizationId, eventId),
  ]);

  const entries: Record<string, LogisticsEntry> = Object.fromEntries(
    rows.map((row) => [
      row.slotKey,
      {
        dispatchedAt: row.dispatchedAt?.toISOString() ?? null,
        deliveredAt: row.deliveredAt?.toISOString() ?? null,
        form: {
          vehicleType: row.vehicleType ?? "",
          vehicleNumber: row.vehicleNumber ?? "",
          driverName: row.driverName ?? "",
          driverPhone: row.driverPhone ?? "",
          dispatchPlannedAt: toLocalInput(row.dispatchPlannedAt),
          dispatchStatus: row.dispatchStatus,
          setupStatus: row.setupStatus,
          setupTime: toLocalInput(row.setupTime),
        },
      },
    ]),
  );

  return (
    <div className="flex flex-col gap-4">
      <StaffingCountsCard orderId={orderId} eventId={eventId} initial={counts} eventManager={event.eventManagerName ?? ""} suggestions={suggestions} canEdit={canEdit} />
      <LogisticsCard
        orderId={orderId}
        eventId={eventId}
        canEdit={canEdit}
        // Logistics opens once the order is sent to the kitchen; an event with no order is not held to it.
        state={orderStatus === null || orderStatus === "SENT_TO_KITCHEN" ? "open" : orderStatus === "COMPLETED" ? "completed" : "notYet"}
        slots={slots.map((slot) => ({ key: slot.key, date: slot.date, title: slot.title }))}
        entries={entries}
        address={address}
      />
    </div>
  );
}
