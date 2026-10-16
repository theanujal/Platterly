import { hasPermission } from "@/lib/auth/require-session";
import { listManagerSuggestions } from "@/modules/employees/assignment";
import { prisma } from "@/lib/db";
import { getStaffCounts } from "@/modules/employees/staff-counts";
import { getLogistics, getDeliveryAddress } from "@/modules/logistics/logistics";
import { StaffingCountsCard } from "./staffing-counts-card";
import { LogisticsCard } from "./logistics-card";

const toLocalInput = (d: Date | null) => (d ? d.toISOString().slice(0, 16) : "");

/**
 * Everything the kitchen team enters for one event, in one place: how many people per duty, and the dispatch and setup
 * details. Used by the event staffing page (which the kitchen role can open) and by the Staffing tab on the order.
 * Staffing and logistics notes live under Additional Details on the order, not here.
 */
export async function EventOps({ organizationId, eventId, orderId }: { organizationId: string; eventId: string; orderId: string | null }) {
  const canEdit = await hasPermission({ staffing: ["edit"] }, organizationId);
  const [counts, event, suggestions, logistics, address] = await Promise.all([getStaffCounts(organizationId, eventId), prisma.event.findFirstOrThrow({ where: { id: eventId, organizationId }, select: { eventManagerName: true } }), listManagerSuggestions(organizationId), getLogistics(organizationId, eventId), getDeliveryAddress(organizationId, orderId)]);

  return (
    <div className="flex flex-col gap-4">
      <StaffingCountsCard orderId={orderId} eventId={eventId} initial={counts} eventManager={event.eventManagerName ?? ""} suggestions={suggestions} canEdit={canEdit} />
      <LogisticsCard
        orderId={orderId}
        eventId={eventId}
        canEdit={canEdit}
        data={{
          address,
          dispatchedAt: logistics?.dispatchedAt?.toISOString() ?? null,
          deliveredAt: logistics?.deliveredAt?.toISOString() ?? null,
          form: {
            vehicleType: logistics?.vehicleType ?? "",
            vehicleNumber: logistics?.vehicleNumber ?? "",
            driverName: logistics?.driverName ?? "",
            driverPhone: logistics?.driverPhone ?? "",
            dispatchPlannedAt: toLocalInput(logistics?.dispatchPlannedAt ?? null),
            dispatchStatus: logistics?.dispatchStatus ?? "NOT_DISPATCHED",
            setupStatus: logistics?.setupStatus ?? "NOT_STARTED",
            setupTime: toLocalInput(logistics?.setupTime ?? null),
          },
        }}
      />
    </div>
  );
}
