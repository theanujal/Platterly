import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { orderAtMyLocation } from "@/modules/locations/active-location";
import { getInvoice, confirmedPaidForOrder } from "@/modules/invoices/invoice";
import { buildInvoiceDocument } from "@/modules/invoices/invoice-document";
import { renderInvoicePdf } from "@/modules/invoices/invoice-pdf";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ invoices: ["view"] }, organizationId);
  const invoice = await getInvoice(organizationId, id);
  if (!invoice || !(await orderAtMyLocation(organizationId, session.user.id, invoice.orderId))) return new Response("Not found", { status: 404 });
  const pdf = renderInvoicePdf(buildInvoiceDocument(invoice, await confirmedPaidForOrder(invoice.orderId)));
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
