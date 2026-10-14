import { prisma } from "@/lib/db";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { assertSharedOrAtMyLocation } from "@/modules/locations/active-location";
import { getPurchaseOrder } from "@/modules/purchasing/purchase-order";
import { renderPurchaseOrderPdf } from "@/modules/purchasing/po-pdf";

/** The purchase order as a PDF download. Read-only: it changes no status, stock or record, and sends nothing to the supplier. Same permission as the page. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ inventory: ["view"] }, organizationId);
  const po = await getPurchaseOrder(organizationId, id);
  if (!po) return new Response("Not found", { status: 404 });
  await assertSharedOrAtMyLocation(organizationId, session.user.id, po.kitchenId); // an order at another location is a 404, as on the page
  const [organization, supplier] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
    prisma.supplier.findFirstOrThrow({ where: { id: po.supplierId, organizationId }, select: { name: true, contactPerson: true, phone: true, email: true, address: true, gstin: true } }),
  ]);
  const pdf = renderPurchaseOrderPdf({
    businessName: organization.name,
    number: po.number,
    status: po.status,
    createdAt: po.createdAt,
    orderedAt: po.orderedAt,
    expectedDate: po.expectedDate,
    notes: po.notes,
    supplier,
    lines: po.items.map((i) => ({ name: i.inventory.name, unit: i.inventory.unit, quantity: Number(i.quantity), receivedQuantity: Number(i.receivedQuantity), unitCost: Number(i.unitCost) })),
  });
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${po.number}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
