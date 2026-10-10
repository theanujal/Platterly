import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { buildTemplate } from "@/modules/menus/import/import";

/** The blank Food Items import template, as Excel (default) or CSV. */
export async function GET(request: Request) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["create"] }, organizationId);
  const csv = new URL(request.url).searchParams.get("format") === "csv";
  const body = buildTemplate(csv ? "csv" : "xlsx");
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": csv ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="food-items-template.${csv ? "csv" : "xlsx"}"`,
    },
  });
}
