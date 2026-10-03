import { resolveToken } from "@/lib/secure-access/token";
import { getInvoiceForCustomer } from "@/modules/invoices/invoice";
import { renderInvoicePdf } from "@/modules/invoices/invoice-pdf";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveToken(token);
  const data = resolved && resolved.resourceType === "INVOICE" ? await getInvoiceForCustomer(resolved.organizationId, resolved.resourceId) : null;
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(renderInvoicePdf(data.invoice)), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${data.invoice.number}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
