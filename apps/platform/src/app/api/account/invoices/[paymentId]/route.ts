import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSession } from "@/lib/session";
import { billingAccess } from "@/modules/store/billing-rights";
import { fetchOpsInvoice } from "@/modules/store/ops-catalogue";
import { opsKeyFor } from "@/modules/store/purchase";

// GET /api/account/invoices/{paymentId}?product=caterly: the GST invoice PDF of one paid payment of the signed-in person's own business. Account host only.
// Ops answers only for a payment that belongs to that business and product, so another business's payment id is a 404, never its invoice.
export async function GET(request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const headers = { "cache-control": "private, no-store" };
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const session = await getSession();
  if (!session) return Response.json({ status: "unauthenticated" }, { status: 401, headers });
  // Only the business's active Admin may download its invoices (the Old Admin sees no finance).
  const access = await billingAccess(session);
  if (access.status !== "ok") return Response.json({ error: "not_found" }, { status: 404, headers });
  const product = new URL(request.url).searchParams.get("product") ?? "";
  const paymentId = (await params).paymentId;
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(product) || !/^[A-Za-z0-9_-]{1,64}$/.test(paymentId)) return Response.json({ error: "not_found" }, { status: 404, headers });
  const invoice = await fetchOpsInvoice(access.businessId, opsKeyFor(product), paymentId);
  if (!invoice.ok) return Response.json({ error: invoice.reason === "not_found" ? "not_found" : "unavailable" }, { status: invoice.reason === "not_found" ? 404 : 502, headers });
  // `?view=1` opens the PDF in the browser (the "View invoice" button); without it the PDF is a download.
  const disposition = new URL(request.url).searchParams.get("view") === "1" ? "inline" : "attachment";
  return new Response(new Uint8Array(invoice.pdf), { headers: { ...headers, "content-type": "application/pdf", "content-disposition": `${disposition}; filename="${invoice.fileName}"`, "x-content-type-options": "nosniff" } });
}
