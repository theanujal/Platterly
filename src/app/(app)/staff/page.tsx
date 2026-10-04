import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { listStaffMembers } from "@/modules/employees/staff-member";
import { listAssignableMembers, listUpcomingSchedule } from "@/modules/employees/assignment";
import { STAFF_DUTY_LABEL } from "@/modules/employees/duty";
import { DISPATCH_STATUS_LABEL, DISPATCH_STATUS_TONE } from "@/modules/logistics/labels";
import { roleLabel } from "@/lib/auth/role-metadata";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActiveBadge } from "@/components/catalog/catalog-display";
import { AddStaffMemberDialog, StaffMemberRowActions } from "./_components/staff-member-dialogs";

export const metadata: Metadata = {
  title: "Staff — Platterly",
  robots: { index: false, follow: false },
};

const formatDate = (d: Date) => d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function StaffPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ staffing: ["view"] }, organizationId);
  const [staff, members, schedule, canCreate, canEdit, canDelete, canSeeTeam] = await Promise.all([
    listStaffMembers(organizationId),
    listAssignableMembers(organizationId),
    listUpcomingSchedule(organizationId, 14),
    hasPermission({ staffing: ["create"] }, organizationId),
    hasPermission({ staffing: ["edit"] }, organizationId),
    hasPermission({ staffing: ["delete"] }, organizationId),
    // The Team privacy settings hide teammates from people who cannot manage the team, so the plain list follows them.
    hasPermission({ users: ["view"] }, organizationId),
  ]);

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Staff" }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Staff</h1>
          <p className="text-sm text-muted-foreground">Who works your events. The kitchen team picks people for each event on the order&apos;s Staffing tab; nothing is worked out for you.</p>
        </div>
        {canCreate && <AddStaffMemberDialog />}
      </div>
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Upcoming events (next 14 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {schedule.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events in the next 14 days.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Guests</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Tasks</TableHead>
                  <TableHead>Dispatch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Link href={`/staff/events/${e.id}`} className="font-medium hover:underline">
                        {e.orderNumber ? `${e.orderNumber} · ${e.customer}` : `${e.name} · ${e.customer}`}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(e.startDate)}</TableCell>
                    <TableCell>{e.guestCount ?? "—"}</TableCell>
                    <TableCell>{e.assigned === 0 ? <Badge variant="warning">No staff yet</Badge> : <Badge variant="success">{e.assigned} assigned</Badge>}</TableCell>
                    <TableCell>{e.tasksTotal === 0 ? "—" : `${e.tasksTotal - e.tasksOpen}/${e.tasksTotal} done`}</TableCell>
                    <TableCell>
                      <Badge variant={DISPATCH_STATUS_TONE[e.dispatchStatus]}>{DISPATCH_STATUS_LABEL[e.dispatchStatus]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Staff without a login ({staff.length})</CardTitle>
          <p className="text-sm text-muted-foreground">Floor staff such as serving, delivery and setup crew. They do not sign in.</p>
        </CardHeader>
        <CardContent>
          {staff.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staff added yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Usual duty</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.phone ?? "—"}</TableCell>
                    <TableCell>{STAFF_DUTY_LABEL[s.defaultDuty]}</TableCell>
                    <TableCell>{s._count.assignments}</TableCell>
                    <TableCell>
                      <ActiveBadge active={s.isActive} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <StaffMemberRowActions id={s.id} name={s.name} canEdit={canEdit} canDelete={canDelete} initialValues={{ name: s.name, phone: s.phone ?? "", defaultDuty: s.defaultDuty, notes: s.notes ?? "", isActive: s.isActive }} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canSeeTeam && (
      <Card>
        <CardHeader>
          <CardTitle>Team members with a login ({members.length})</CardTitle>
          <p className="text-sm text-muted-foreground">They can be scheduled too. Invite or change them in Settings &gt; Team.</p>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-wrap gap-2">
            {members.map((m) => (
              <li key={m.id}>
                <Badge variant="neutral">
                  {m.name} · {roleLabel(m.role)}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
