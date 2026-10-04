import { hasPermission } from "@/lib/auth/require-session";
import { listEventAssignments, listAssignableMembers } from "@/modules/employees/assignment";
import { listStaffMembers } from "@/modules/employees/staff-member";
import { listEventTasks } from "@/modules/logistics/task";
import { getLogistics, getDeliveryAddress } from "@/modules/logistics/logistics";
import { StaffingCard } from "../../orders/[id]/_components/staffing-card";
import { TasksCard } from "./tasks-card";
import { LogisticsCard } from "./logistics-card";

const toLocalInput = (d: Date | null) => (d ? d.toISOString().slice(0, 16) : "");

/**
 * Everything the kitchen team does for one event, in one place: staff, tasks and logistics. Used by the event staffing
 * page (which the kitchen role can open) and by the Staffing tab on the order (owners and managers).
 */
export async function EventOps({ organizationId, eventId, orderId }: { organizationId: string; eventId: string; orderId: string | null }) {
  const [canAdd, canEdit] = await Promise.all([hasPermission({ staffing: ["create"] }, organizationId), hasPermission({ staffing: ["edit"] }, organizationId)]);
  const [assignments, floorStaff, teamMembers, tasks, logistics, address] = await Promise.all([
    listEventAssignments(organizationId, eventId),
    canAdd ? listStaffMembers(organizationId) : Promise.resolve([]),
    canAdd ? listAssignableMembers(organizationId) : Promise.resolve([]),
    listEventTasks(organizationId, eventId),
    getLogistics(organizationId, eventId),
    getDeliveryAddress(organizationId, orderId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <StaffingCard
        orderId={orderId}
        eventId={eventId}
        data={{ assignments, floorStaff: floorStaff.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name, defaultDuty: s.defaultDuty })), teamMembers }}
        canAdd={canAdd}
        canEdit={canEdit}
        canRemove={canEdit}
      />
      <TasksCard
        orderId={orderId}
        eventId={eventId}
        canAdd={canAdd}
        canEdit={canEdit}
        people={assignments.map((a) => ({ assignmentId: a.id, name: a.name }))}
        tasks={tasks.map((t) => ({
          id: t.id,
          title: t.title,
          notes: t.notes,
          dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
          done: t.done,
          assignee: t.assignment ? (t.assignment.staffMember?.name ?? assignments.find((a) => a.id === t.assignment?.id)?.name ?? null) : null,
        }))}
      />
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
            setupNotes: logistics?.setupNotes ?? "",
          },
        }}
      />
    </div>
  );
}
