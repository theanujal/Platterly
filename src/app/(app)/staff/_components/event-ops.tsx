import { hasPermission } from "@/lib/auth/require-session";
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
  const [counts, logistics, address] = await Promise.all([getStaffCounts(organizationId, eventId), getLogistics(organizationId, eventId), getDeliveryAddress(organizationId, orderId)]);

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
      <StaffingCountsCard orderId={orderId} eventId={eventId} initial={counts} canEdit={canEdit} />
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
