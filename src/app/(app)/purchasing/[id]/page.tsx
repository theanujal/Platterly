import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import { requireActiveOrganization, requirePermission, hasPermission, canSee } from "@/lib/auth/require-session";
import { assertSharedOrAtMyLocation } from "@/modules/locations/active-location";
import { getPurchaseOrder, listReceipts, receivedValueOf } from "@/modules/purchasing/purchase-order";
import { isPriced, orderedValue, remainingQuantity, PO_STATUS_LABEL, PO_STATUS_TONE } from "@/modules/purchasing/po-math";
import { buildPoWhatsappMessage, whatsappOrderLink } from "@/modules/purchasing/po-whatsapp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupees } from "@/components/catalog/catalog-display";
import { PurchaseOrderActions } from "../_components/purchase-order-actions";

export const metadata: Metadata = {
  title: "Purchase Order — Caterly",
  robots: { index: false, follow: false },
};

const formatDate = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ inventory: ["view"] }, organizationId);
  const [po, canEdit, canDelete, showCosts] = await Promise.all([getPurchaseOrder(organizationId, id), hasPermission({ inventory: ["edit"] }, organizationId), hasPermission({ inventory: ["delete"] }, organizationId), canSee("supplierCosts", organizationId)]);
  if (!po) notFound();
  const [receipts, received] = await Promise.all([listReceipts(organizationId, po.id), receivedValueOf(po.id)]);
  await assertSharedOrAtMyLocation(organizationId, session.user.id, po.kitchenId);

  const lines = po.items.map((i) => ({ id: i.id, name: i.inventory.name, unit: i.inventory.unit, quantity: Number(i.quantity), receivedQuantity: Number(i.receivedQuantity), unitCost: showCosts ? Number(i.unitCost) : 0 }));

  const priced = isPriced(lines);
  // Click-to-chat for a draft: no prices, and the order only becomes "Ordered" once the person confirms they sent it.
  const message = buildPoWhatsappMessage({ supplierName: po.supplier.name, number: po.number, lines: lines.map((l) => ({ name: l.name, quantity: l.quantity, unit: l.unit })) });
  const waLink = whatsappOrderLink(po.supplier.phone, message);

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Purchasing", href: "/purchasing" }, { label: po.number }]} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{po.number}</h1>
            <Badge variant={PO_STATUS_TONE[po.status]}>{PO_STATUS_LABEL[po.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Supplier:{" "}
            <Link href={`/suppliers/${po.supplier.id}`} className="font-medium text-foreground hover:underline">
              {po.supplier.name}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" render={<a href={`/purchasing/${po.id}/pdf`} download />} nativeButton={false}>
            <Download aria-hidden />
            Download PDF
          </Button>
          <PurchaseOrderActions
            id={po.id}
            number={po.number}
            status={po.status}
            canEdit={canEdit}
            canDelete={canDelete}
            supplierName={po.supplier.name}
            message={message}
            waLink={waLink}
            hasReceipts={receipts.length > 0 || received.legacyQuantity > 0}
            orderPlacedOn={`${po.createdAt.getFullYear()}-${String(po.createdAt.getMonth() + 1).padStart(2, "0")}-${String(po.createdAt.getDate()).padStart(2, "0")}`}
            receiveLines={!showCosts ? [] : lines.map((l, index) => ({ itemId: po.items[index].id, name: l.name, unit: l.unit, remaining: remainingQuantity(l), expiryRequired: po.items[index].inventory.tracksExpiry, lastCost: po.items[index].inventory.costPerUnit === null ? null : Number(po.items[index].inventory.costPerUnit) }))}
          />
        </div>
      </div>
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Ordered</TableHead>
                <TableHead>Received</TableHead>
                {priced && <TableHead>Unit cost</TableHead>}
                {priced && <TableHead className="text-right">Amount</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell>
                    {l.quantity} {l.unit}
                  </TableCell>
                  <TableCell>
                    {l.receivedQuantity} {l.unit}
                  </TableCell>
                  {priced && <TableCell>{formatRupees(l.unitCost)}</TableCell>}
                  {priced && <TableCell className="text-right">{formatRupees(l.quantity * l.unitCost)}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {priced && (
            <div className="mt-4 flex flex-col items-end gap-1 text-sm">
              <p>
                Order total: <span className="font-semibold">{formatRupees(orderedValue(lines))}</span>
              </p>
            </div>
          )}
          {!priced && <p className="mt-4 text-sm text-muted-foreground">{showCosts ? "Not yet priced. The actual cost is entered when the stock is received." : "Costs are not shown for your role."}</p>}
          {showCosts && received.value > 0 && (
            <p className="mt-2 text-right text-sm text-muted-foreground">
              Received so far, at the prices paid: <span className="font-semibold text-foreground">{formatRupees(received.value)}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {(receipts.length > 0 || received.legacyQuantity > 0) && (
        <Card id="receipts">
          <CardHeader>
            <CardTitle>Receipt history</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received on</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Quantity</TableHead>
                  {showCosts && <TableHead>Unit cost</TableHead>}
                  <TableHead>Expiry</TableHead>
                  <TableHead>Lot</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.flatMap((r) =>
                  r.lines.map((l, index) => (
                    <TableRow key={l.id}>
                      <TableCell>{index === 0 ? formatDate(r.receivedDate) : ""}</TableCell>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell>
                        {l.quantity} {l.unit}
                      </TableCell>
                      {showCosts && <TableCell>{formatRupees(l.unitCost)}</TableCell>}
                      <TableCell>{formatDate(l.expiryDate)}</TableCell>
                      <TableCell>{l.lotNumber ?? "—"}</TableCell>
                      <TableCell>{index === 0 ? (r.invoiceNumber ?? "—") : ""}</TableCell>
                      <TableCell className="max-w-64 text-xs whitespace-normal text-muted-foreground">
                        {[showCosts && l.costNote ? `Free: ${l.costNote}` : null, l.extraQuantity > 0 ? `${l.extraQuantity} ${l.unit} above the order, authorised: ${l.extraReason ?? ""}` : null].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                    </TableRow>
                  )),
                )}
              </TableBody>
            </Table>
            {received.legacyQuantity > 0 && <p className="mt-3 text-sm text-muted-foreground">{received.legacyQuantity} was received before individual receipts were recorded, so it has no price or expiry date of its own.</p>}
          </CardContent>
        </Card>
      )}

      {po.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{po.notes}</CardContent>
        </Card>
      )}
    </div>
  );
}
