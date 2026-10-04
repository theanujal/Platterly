import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getActiveLocation } from "@/modules/locations/active-location";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { listPurchaseOrders } from "@/modules/purchasing/purchase-order";
import { orderedValue, PO_STATUS_LABEL, PO_STATUS_TONE } from "@/modules/purchasing/po-math";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionTabs } from "@/components/app-shell/section-tabs";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupees } from "@/components/catalog/catalog-display";
import type { PurchaseOrderStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Purchasing — Platterly",
  robots: { index: false, follow: false },
};

const STATUSES = Object.keys(PO_STATUS_LABEL) as PurchaseOrderStatus[];

const formatDate = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

export default async function PurchasingPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { organizationId, session } = await requireActiveOrganization();
  const { locationId } = await getActiveLocation(organizationId, session.user.id);
  await requirePermission({ inventory: ["view"] }, organizationId);
  const filter = STATUSES.includes(status as PurchaseOrderStatus) ? (status as PurchaseOrderStatus) : undefined;
  const [orders, canCreate] = await Promise.all([listPurchaseOrders(organizationId, filter, undefined, locationId), hasPermission({ inventory: ["create"] }, organizationId)]);

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Stock & Supplies" }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Stock & Supplies</h1>
          <p className="text-sm text-muted-foreground">Purchase requests and orders to your suppliers. Receiving an order adds the stock.</p>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <Button variant="outline" render={<Link href="/purchasing/new?from=low-stock" />} nativeButton={false}>
              Reorder low stock
            </Button>
            <Button render={<Link href="/purchasing/new" />} nativeButton={false}>
              <Plus className="size-4" /> New order
            </Button>
          </div>
        )}
      </div>
      <SectionTabs group="stock" active="/purchasing" organizationId={organizationId} />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        <Button size="md" variant={filter ? "outline" : "default"} render={<Link href="/purchasing" />} nativeButton={false}>
          All
        </Button>
        {STATUSES.map((s) => (
          <Button key={s} size="md" variant={filter === s ? "default" : "outline"} render={<Link href={`/purchasing?status=${s}`} />} nativeButton={false}>
            {PO_STATUS_LABEL[s]}
          </Button>
        ))}
      </div>

      {orders.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No purchase orders{filter ? ` that are ${PO_STATUS_LABEL[filter].toLowerCase()}` : " yet"}.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((po) => (
              <TableRow key={po.id}>
                <TableCell>
                  <Link href={`/purchasing/${po.id}`} className="font-medium hover:underline">
                    {po.number}
                  </Link>
                </TableCell>
                <TableCell>{po.supplier.name}</TableCell>
                <TableCell>
                  <Badge variant={PO_STATUS_TONE[po.status]}>{PO_STATUS_LABEL[po.status]}</Badge>
                </TableCell>
                <TableCell>{po.items.length}</TableCell>
                <TableCell>{formatDate(po.expectedDate)}</TableCell>
                <TableCell className="text-right font-medium">{formatRupees(orderedValue(po.items.map((i) => ({ quantity: Number(i.quantity), receivedQuantity: Number(i.receivedQuantity), unitCost: Number(i.unitCost) }))))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
