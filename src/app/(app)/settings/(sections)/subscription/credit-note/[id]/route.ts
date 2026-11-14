import { canSee, requireActiveOrganization } from "@/lib/auth/require-session";
import { fetchBillingPdf } from "@/modules/ops-link/plan-billing";

export const dynamic = "force-dynamic";

// GET: this kitchen's credit-note as a PDF, from Platterly Ops. Needs "Billing and Plan" (404 without it, so the page's existence is not given away). Ops answers only for this kitchen's own record.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { organizationId } = await requireActiveOrganization();
  if (!(await canSee("planBilling", organizationId))) return new Response("Not found", { status: 404 });
  const file = await fetchBillingPdf("credit-note", organizationId, (await params).id);
  if (!file.ok) return new Response(file.reason === "not_found" ? "Not found" : "Billing could not be reached", { status: file.reason === "not_found" ? 404 : 502 });
  return new Response(new Uint8Array(file.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file.fileName}"`, "Cache-Control": "private, no-store" } });
}
