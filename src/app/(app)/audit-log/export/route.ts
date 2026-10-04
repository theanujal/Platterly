import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { exportResponse, parseFormat } from "@/lib/export/tabular";
import { AUDIT_EXPORT_LIMIT, exportAuditLog } from "@/modules/audit/audit-log";
import { parseIsoDate } from "@/modules/expenses/date-range";
import { aboutSheet, auditSheets } from "@/modules/reports/export-sheets";

/** Chunk 24 — the Audit Log with the page's filters (search, record, person, dates) as CSV or Excel, newest first, at most 10,000 rows. */
export async function GET(request: Request) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ audit: ["view"] }, organizationId);
  await requirePermission({ reports: ["export"] }, organizationId);
  const q = new URL(request.url).searchParams;
  const from = parseIsoDate(q.get("from") ?? undefined);
  const to = parseIsoDate(q.get("to") ?? undefined);
  const [organization, entries] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
    exportAuditLog(organizationId, { search: q.get("q") ?? undefined, recordType: q.get("type") ?? undefined, actorId: q.get("who") ?? undefined, from, to }),
  ]);
  const note = entries.length >= AUDIT_EXPORT_LIMIT ? `Only the newest ${AUDIT_EXPORT_LIMIT.toLocaleString("en-IN")} entries are included. Narrow the dates for the rest.` : undefined;
  const about = aboutSheet({ report: "Audit log", kitchen: organization.name, from, to, note });
  return exportResponse(parseFormat(q.get("format")), `${organization.name} audit log`, [about, ...auditSheets(entries)]);
}
