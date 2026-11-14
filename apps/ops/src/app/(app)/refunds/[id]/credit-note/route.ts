import { getStaff } from "@/lib/session";
import { renderCreditNote } from "@/modules/billing/invoice-pdf";

export const dynamic = "force-dynamic";

/** GET: the PDF credit note of one refund (the id is the refund's), from the invoice's frozen snapshot. Staff only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getStaff())) return new Response("Unauthorized", { status: 401 });
  const note = await renderCreditNote((await params).id);
  if (!note) return new Response("Not found", { status: 404 });
  return new Response(note.bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${note.fileName}"`, "Cache-Control": "private, no-store" } });
}
