import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { assertSharedOrAtMyLocation } from "@/modules/locations/active-location";
import { getPurchaseOrder } from "@/modules/purchasing/purchase-order";
import { orderedValue, receivedValue, remainingQuantity, PO_STATUS_LABEL, PO_STATUS_TONE } from "@/modules/purchasing/po-math";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupees } from "@/components/catalog/catalog-display";
import { PurchaseOrderActions } from "../_components/purchase-order-actions";

export const metadata: Metadata = {
  title: "Purchase Order — Platterly",
  robots: { index: false, follow: false },
};

const formatDate = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ inventory: ["view"] }, organizationId);
  const [po, canEdit, canDelete] = await Promise.all([getPurchaseOrder(organizationId, id), hasPermission({ inventory: ["edit"] }, organizationId), hasPermission({ inventory: ["delete"] }, organizationId)]);
  if (!po) notFound();
  await assertSharedOrAtMyLocation(organizationId, session.user.id, po.kitchenId);

  const lines = po.items.map((i) => ({ id: i.id, name: i.inventory.name, unit: i.inventory.unit, quantity: Number(i.quantity), receivedQuantity: Number(i.receivedQuantity), unitCost: Number(i.unitCost) }));

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
            {" · "}Expected {formatDate(po.expectedDate)}
          </p>
        </div>
        <PurchaseOrderActions
          id={po.id}
          number={po.number}
          status={po.status}
          canEdit={canEdit}
          canDelete={canDelete}
          receiveLines={lines.map((l, index) => ({ itemId: po.items[index].id, name: l.name, unit: l.unit, remaining: remainingQuantity(l) }))}
        />
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
                <TableHead>Unit cost</TableHead>
                <TableHead className="text-right">Amount</TableHead>
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
                  <TableCell>{formatRupees(l.unitCost)}</TableCell>
                  <TableCell className="text-right">{formatRupees(l.quantity * l.unitCost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex flex-col items-end gap-1 text-sm">
            <p>
              Order total: <span className="font-semibold">{formatRupees(orderedValue(lines))}</span>
            </p>
            <p className="text-muted-foreground">Received so far: {formatRupees(receivedValue(lines))}</p>
          </div>
        </CardContent>
      </Card>

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
