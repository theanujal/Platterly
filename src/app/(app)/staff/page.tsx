import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Users } from "lucide-react";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { listStaffMembers } from "@/modules/employees/staff-member";
import { listAssignableMembers, listUpcomingSchedule } from "@/modules/employees/assignment";
import { SCHEDULE_RANGES as RANGE_OPTIONS, STAFF_DUTY_LABEL, STAFFING_STATUS_LABEL, type StaffingStatus } from "@/modules/employees/duty";
import { roleLabel } from "@/lib/auth/role-metadata";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { IconTip } from "@/components/ui/icon-tip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActiveBadge } from "@/components/catalog/catalog-display";
import { ScheduleFilters } from "./_components/schedule-filters";
import { AddStaffMemberDialog, StaffMemberRowActions } from "./_components/staff-member-dialogs";

export const metadata: Metadata = {
  title: "Staff — Caterly",
  robots: { index: false, follow: false },
};

const formatDate = (d: Date) => d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const PAGE_SIZE = 10;
// Shared list styling (design system: rich list): muted header row with small uppercase headings, roomy cells.
const HEAD = "h-12 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase";
const CELL = "px-3 py-3 text-sm";
const STATUS_TONE: Record<StaffingStatus, "warning" | "info" | "success"> = { NOT_STARTED: "warning", IN_PROGRESS: "info", COMPLETE: "success" };

function StatCard({ icon: Icon, tile, value, label, children }: { icon: typeof Users; tile: string; value: number; label: string; children?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <span className={`flex size-14 shrink-0 items-center justify-center rounded-xl ${tile}`}>
          <Icon className="size-6" aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-3xl font-semibold leading-none">{value.toLocaleString("en-IN")}</span>
          <span className="text-sm text-muted-foreground">{label}</span>
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ days?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const days = RANGE_OPTIONS.find((d) => String(d) === sp.days) ?? RANGE_OPTIONS[0];
  const q = (sp.q ?? "").trim();
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ staffing: ["view"] }, organizationId);
  const [staff, members, upcoming, canCreate, canEdit, canDelete, canSeeTeam] = await Promise.all([
    listStaffMembers(organizationId),
    listAssignableMembers(organizationId),
    listUpcomingSchedule(organizationId, days),
    hasPermission({ staffing: ["create"] }, organizationId),
    hasPermission({ staffing: ["edit"] }, organizationId),
    hasPermission({ staffing: ["delete"] }, organizationId),
    // The Team privacy settings hide teammates from people who cannot manage the team, so the plain list follows them.
    hasPermission({ users: ["view"] }, organizationId),
  ]);

  const needle = q.toLowerCase();
  const schedule = needle ? upcoming.filter((e) => [e.orderNumber, e.name, e.customer].some((v) => v?.toLowerCase().includes(needle))) : upcoming;
  const incomplete = schedule.filter((e) => e.staffing !== "COMPLETE").length;
  const guests = schedule.reduce((sum, e) => sum + (e.guestCount ?? 0), 0);
  const pages = Math.max(1, Math.ceil(schedule.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  const rows = schedule.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (days !== RANGE_OPTIONS[0]) params.set("days", String(days));
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/staff?${qs}` : "/staff";
  };

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Staff" }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Staff</h1>
          <p className="text-sm text-muted-foreground">Manage operational staff and track staffing readiness for upcoming events.</p>
        </div>
        {canCreate && <AddStaffMemberDialog />}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="staff-stats">
        <StatCard icon={CalendarDays} tile="bg-info/10 text-info" value={schedule.length} label="Upcoming Events">
          <span className="text-xs text-muted-foreground">In next {days} days</span>
        </StatCard>
        <StatCard icon={Users} tile="bg-warning/10 text-warning" value={incomplete} label="Staffing Incomplete">
          {incomplete > 0 && (
            <Badge variant="warning" className="w-fit">
              Needs attention
            </Badge>
          )}
        </StatCard>
        <StatCard icon={Users} tile="bg-success/10 text-success" value={guests} label="Total Guests">
          <span className="text-xs text-muted-foreground">Across upcoming events</span>
        </StatCard>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Upcoming Events (Next {days} Days)</CardTitle>
            <p className="text-sm text-muted-foreground">Events and their staffing status. Click &ldquo;Manage Staffing&rdquo; to assign or update staff for each event.</p>
          </div>
          <ScheduleFilters days={days} q={q} />
        </CardHeader>
        <CardContent>
          {schedule.length === 0 ? (
            <p className="text-sm text-muted-foreground">{q ? "No events match your search." : `No events in the next ${days} days.`}</p>
          ) : (
            <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className={HEAD}>Event / Order ID</TableHead>
                  <TableHead className={HEAD}>Date</TableHead>
                  <TableHead className={HEAD}>Guests</TableHead>
                  <TableHead className={HEAD}>Event Manager</TableHead>
                  <TableHead className={HEAD}>Staffing Status</TableHead>
                  <TableHead className={`${HEAD} text-right`}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className={CELL}>
                      <div className="font-semibold">{e.customer}</div>
                      <div className="text-xs text-muted-foreground">{e.orderNumber ?? e.name}</div>
                    </TableCell>
                    <TableCell className={CELL}>{formatDate(e.startDate)}</TableCell>
                    <TableCell className={CELL}>{e.guestCount ?? "—"}</TableCell>
                    <TableCell className={CELL}>{e.eventManagerName ?? "—"}</TableCell>
                    <TableCell className={CELL}>
                      <Badge variant={STATUS_TONE[e.staffing]}>{STAFFING_STATUS_LABEL[e.staffing]}</Badge>
                    </TableCell>
                    <TableCell className={CELL}>
                      <div className="flex justify-end">
                        <Button variant="outline" size="md" render={<Link href={`/staff/events/${e.id}`} />} nativeButton={false}>
                          Manage Staffing
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
          {schedule.length > PAGE_SIZE && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground" data-testid="staff-paging">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, schedule.length)} of {schedule.length}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="md" disabled={page <= 1} render={<Link href={pageHref(page - 1)} />} nativeButton={false} aria-label="Previous page">
                  <ChevronLeft className="size-4" aria-hidden /> Previous
                </Button>
                <span>
                  Page {page} of {pages}
                </span>
                <Button variant="outline" size="md" disabled={page >= pages} render={<Link href={pageHref(page + 1)} />} nativeButton={false} aria-label="Next page">
                  Next <ChevronRight className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Operational Staff</CardTitle>
                <p className="text-sm text-muted-foreground">Floor staff such as serving and setup crew. They do not sign in.</p>
              </div>
              <Badge variant="neutral">
                {staff.length} {staff.length === 1 ? "member" : "members"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {staff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff added yet.</p>
            ) : (
              <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className={HEAD}>Name</TableHead>
                    <TableHead className={HEAD}>Phone</TableHead>
                    <TableHead className={HEAD}>Usual duty</TableHead>
                    <TableHead className={HEAD}>Events</TableHead>
                    <TableHead className={HEAD}>Status</TableHead>
                    <TableHead className={`${HEAD} text-right`}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className={`${CELL} font-semibold`}>{s.name}</TableCell>
                      <TableCell className={CELL}>{s.phone ?? "—"}</TableCell>
                      <TableCell className={CELL}>{STAFF_DUTY_LABEL[s.defaultDuty]}</TableCell>
                      <TableCell className={CELL}>{s._count.assignments}</TableCell>
                      <TableCell className={CELL}>
                        <ActiveBadge active={s.isActive} />
                      </TableCell>
                      <TableCell className={CELL}>
                        <div className="flex justify-end">
                          <StaffMemberRowActions id={s.id} name={s.name} canEdit={canEdit} canDelete={canDelete} initialValues={{ name: s.name, phone: s.phone ?? "", defaultDuty: s.defaultDuty, notes: s.notes ?? "", isActive: s.isActive }} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {canSeeTeam && (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Team Members with Access</CardTitle>
                  <p className="text-sm text-muted-foreground">Kitchen administrators and managers who can sign in to Platterly.</p>
                </div>
                <Badge variant="neutral">
                  {members.length} {members.length === 1 ? "member" : "members"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className={HEAD}>Name</TableHead>
                    <TableHead className={HEAD}>Role</TableHead>
                    <TableHead className={HEAD}>Status</TableHead>
                    <TableHead className={`${HEAD} text-right`}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className={`${CELL} font-semibold`}>{m.name}</TableCell>
                      <TableCell className={CELL}>{roleLabel(m.role)}</TableCell>
                      <TableCell className={CELL}>
                        <ActiveBadge active />
                      </TableCell>
                      <TableCell className={CELL}>
                        <div className="flex justify-end">
                          <IconTip label="Edit in Team settings">
                            <Button variant="ghost" size="icon" render={<Link href="/settings/team" />} nativeButton={false} aria-label={`Manage ${m.name} in Team settings`}>
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                          </IconTip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
