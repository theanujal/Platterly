import { getStaff } from "@/lib/session";
import { getStandOrderForStaff } from "@/modules/stand/stand";
import { buildStandPrintFile } from "@/modules/stand/print-file";

export const dynamic = "force-dynamic";

/** GET: the print-ready A6 PDF for a paid stand order. Staff only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getStaff())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const order = await getStandOrderForStaff(id);
  if (!order || order.paymentStatus !== "PAID") return new Response("Not found", { status: 404 });
  const bytes = await buildStandPrintFile({ kitchenName: order.kitchenName, kitchenLogoUrl: order.kitchenLogoUrl, linkUrl: order.linkUrl });
  return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="order-qr-stand-${order.id.slice(-8)}.pdf"`, "Cache-Control": "no-store" } });
}
