import { getStaff } from "@/lib/session";
import { renderPaymentInvoice } from "@/modules/billing/invoice-pdf";

export const dynamic = "force-dynamic";

/** GET: the PDF of one paid plan invoice, the same layout the business downloads in its product, from the frozen snapshot. Staff only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getStaff())) return new Response("Unauthorized", { status: 401 });
  const invoice = await renderPaymentInvoice((await params).id);
  if (!invoice) return new Response("Not found", { status: 404 });
  return new Response(invoice.bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${invoice.fileName}"`, "Cache-Control": "private, no-store" } });
}
