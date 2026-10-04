import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { exportResponse, parseFormat } from "@/lib/export/tabular";
import { resolveRange } from "@/modules/expenses/date-range";
import { listProfitability } from "@/modules/expenses/expense";
import { aboutSheet, profitabilitySheets } from "@/modules/reports/export-sheets";

/** Chunk 24 — Profitability (one row per order, for the chosen event-date range) as CSV or Excel. */
export async function GET(request: Request) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ expenses: ["view"] }, organizationId);
  await requirePermission({ reports: ["export"] }, organizationId);
  const url = new URL(request.url);
  const range = resolveRange({ range: url.searchParams.get("range") ?? undefined, from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined });
  const [organization, rows] = await Promise.all([prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }), listProfitability(organizationId, range)]);
  const about = aboutSheet({ report: "Profitability (by event date)", kitchen: organization.name, from: range.from, to: range.to, note: "Revenue is the order total; cancelled orders are left out." });
  return exportResponse(parseFormat(url.searchParams.get("format")), `${organization.name} profitability`, [about, ...profitabilitySheets(rows)]);
}
