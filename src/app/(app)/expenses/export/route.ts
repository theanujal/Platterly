import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { exportResponse, parseFormat } from "@/lib/export/tabular";
import { listExpenses } from "@/modules/expenses/expense";
import { aboutSheet, expensesSheets } from "@/modules/reports/export-sheets";

/** Chunk 24 — every expense, order and company, as CSV or Excel. */
export async function GET(request: Request) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ expenses: ["view"] }, organizationId);
  await requirePermission({ reports: ["export"] }, organizationId);
  const [organization, rows] = await Promise.all([prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }), listExpenses(organizationId)]);
  const about = aboutSheet({ report: "Expenses", kitchen: organization.name });
  return exportResponse(parseFormat(new URL(request.url).searchParams.get("format")), `${organization.name} expenses`, [about, ...expensesSheets(rows)]);
}
