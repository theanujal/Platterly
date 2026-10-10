import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { buildInventoryTemplate } from "@/modules/inventory/import/import";

/** The blank Inventory Items import template, as Excel (default) or CSV. */
export async function GET(request: Request) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["create"] }, organizationId);
  const csv = new URL(request.url).searchParams.get("format") === "csv";
  return new Response(buildInventoryTemplate(csv ? "csv" : "xlsx") as BodyInit, {
    headers: {
      "Content-Type": csv ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="inventory-items-template.${csv ? "csv" : "xlsx"}"`,
    },
  });
}
