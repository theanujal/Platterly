import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSession } from "@/lib/session";
import { billingAccess } from "@/modules/store/billing-rights";
import { fetchOpsCreditNote } from "@/modules/store/ops-catalogue";
import { opsKeyFor } from "@/modules/store/purchase";

// GET /api/account/credit-notes/{refundId}?product=caterly: the credit note PDF of one refund of the signed-in person's own business. Account host only, active Admin only.
// Ops answers only for a refund that belongs to that business and product, so another business's refund id is a 404.
export async function GET(request: Request, { params }: { params: Promise<{ refundId: string }> }) {
  const headers = { "cache-control": "private, no-store" };
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const session = await getSession();
  if (!session) return Response.json({ status: "unauthenticated" }, { status: 401, headers });
  const access = await billingAccess(session);
  if (access.status !== "ok") return Response.json({ error: "not_found" }, { status: 404, headers });
  const product = new URL(request.url).searchParams.get("product") ?? "";
  const refundId = (await params).refundId;
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(product) || !/^[A-Za-z0-9_-]{1,64}$/.test(refundId)) return Response.json({ error: "not_found" }, { status: 404, headers });
  const note = await fetchOpsCreditNote(access.businessId, opsKeyFor(product), refundId);
  if (!note.ok) return Response.json({ error: note.reason === "not_found" ? "not_found" : "unavailable" }, { status: note.reason === "not_found" ? 404 : 502, headers });
  return new Response(new Uint8Array(note.pdf), { headers: { ...headers, "content-type": "application/pdf", "content-disposition": `attachment; filename="${note.fileName}"` } });
}
