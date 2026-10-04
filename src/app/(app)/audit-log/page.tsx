import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { hasPermission, requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listAuditLog } from "@/modules/audit/audit-log";
import { parseIsoDate } from "@/modules/expenses/date-range";
import { ExportMenu } from "@/components/reports/export-menu";
import { SectionTabs } from "@/components/app-shell/section-tabs";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { AuditFilters } from "./_components/audit-filters";
import { AuditTable } from "./_components/audit-table";

export const metadata: Metadata = {
  title: "Audit Log — Platterly",
  robots: { index: false, follow: false },
};

type Query = { q?: string; type?: string; who?: string; from?: string; to?: string; page?: string };

const WHEN = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

// Chunk 17.2: who changed what, and when. Owners and managers only (the `audit` permission).
export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ audit: ["view"] }, organizationId);
  const canExport = await hasPermission({ reports: ["export"] }, organizationId);
  const query = await searchParams;

  const log = await listAuditLog(organizationId, {
    search: query.q,
    recordType: query.type,
    actorId: query.who,
    from: parseIsoDate(query.from),
    to: parseIsoDate(query.to),
    page: Number(query.page) || 1,
  });

  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value && key !== "page") params.set(key, value);
    if (page > 1) params.set("page", String(page));
    return params.size > 0 ? `/audit-log?${params}` : "/audit-log";
  };

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reports & Activity" }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports & Activity</h1>
          <p className="text-sm text-muted-foreground">Who changed what, and when. Every change to your orders, customers, money, menus and settings is recorded here and cannot be edited.</p>
        </div>
        {canExport && <ExportMenu href="/audit-log/export" params={{ q: query.q, type: query.type, who: query.who, from: query.from, to: query.to }} />}
      </div>
      <SectionTabs group="reports" active="/audit-log" organizationId={organizationId} />
      <AuditFilters
        initial={{ q: query.q ?? "", type: query.type ?? "", who: query.who ?? "", from: query.from ?? "", to: query.to ?? "" }}
        recordTypes={log.recordTypes}
        actors={log.actors}
      />
      <AuditTable
        rows={log.entries.map((e) => ({
          id: e.id,
          when: WHEN.format(e.createdAt),
          who: e.who,
          summary: e.summary,
          action: e.action,
          recordType: e.recordType,
          recordId: e.recordId,
          href: e.href,
          changes: e.changes,
        }))}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground" data-testid="audit-paging">
        <span>{log.total === 0 ? "Nothing recorded for these filters." : `Showing ${log.from}–${log.to} of ${log.total.toLocaleString("en-IN")}`}</span>
        {log.pages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="md" disabled={log.page <= 1} render={<Link href={pageHref(log.page - 1)} />} nativeButton={false} aria-label="Previous page">
              <ChevronLeft className="size-4" aria-hidden /> Previous
            </Button>
            <span>
              Page {log.page} of {log.pages}
            </span>
            <Button variant="outline" size="md" disabled={log.page >= log.pages} render={<Link href={pageHref(log.page + 1)} />} nativeButton={false} aria-label="Next page">
              Next <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
