import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Download, Plus } from "lucide-react";
import { getActiveLocation } from "@/modules/locations/active-location";
import { requireActiveOrganization, requirePermission, hasPermission, canSee } from "@/lib/auth/require-session";
import { listPurchaseOrders } from "@/modules/purchasing/purchase-order";
import { isPriced, orderedValue, PO_STATUS_LABEL, PO_STATUS_TONE } from "@/modules/purchasing/po-math";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconTip } from "@/components/ui/icon-tip";
import { SectionTabs } from "@/components/app-shell/section-tabs";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { CATALOG_GRID_CLASSNAME, CatalogCardBody } from "@/components/catalog/catalog-display";
import { formatRupees } from "@/components/catalog/catalog-display";
import type { PurchaseOrderStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Purchasing — Caterly",
  robots: { index: false, follow: false },
};

const STATUSES = Object.keys(PO_STATUS_LABEL) as PurchaseOrderStatus[];

export default async function PurchasingPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { organizationId, session } = await requireActiveOrganization();
  const { locationId } = await getActiveLocation(organizationId, session.user.id);
  await requirePermission({ inventory: ["view"] }, organizationId);
  const filter = STATUSES.includes(status as PurchaseOrderStatus) ? (status as PurchaseOrderStatus) : undefined;
  const [orders, canCreate, showCosts] = await Promise.all([listPurchaseOrders(organizationId, filter, undefined, locationId), hasPermission({ inventory: ["create"] }, organizationId), canSee("supplierCosts", organizationId)]);

  // Orders raised without prices have no value yet (₹0.00 would read as a real total); received stock is valued at the price actually paid on each receipt.
  function totalOf(po: (typeof orders)[number]) {
    const lines = po.items.map((i) => ({ quantity: Number(i.quantity), receivedQuantity: Number(i.receivedQuantity), unitCost: Number(i.unitCost) }));
    const received = po.items.reduce((sum, i) => {
      const receiptQty = i.receiptLines.reduce((q, l) => q + Number(l.quantity), 0);
      const legacy = Math.max(0, Number(i.receivedQuantity) - receiptQty);
      return sum + i.receiptLines.reduce((v, l) => v + Number(l.quantity) * Number(l.unitCost), 0) + legacy * Number(i.unitCost);
    }, 0);
    if (isPriced(lines)) return { text: formatRupees(orderedValue(lines)), sort: orderedValue(lines) };
    if (received > 0) return { text: `${formatRupees(received)} received`, sort: received };
    return { text: "Not yet priced", sort: 0 };
  }

  const entries: CatalogEntry[] = orders.map((po) => {
    const total = totalOf(po);
    const status = <Badge variant={PO_STATUS_TONE[po.status]}>{PO_STATUS_LABEL[po.status]}</Badge>;
    return {
      id: po.id,
      href: `/purchasing/${po.id}`,
      searchText: `${po.number} ${po.supplier.name} ${PO_STATUS_LABEL[po.status]}`,
      sortValues: { newest: po.createdAt.getTime(), number: po.number, ...(showCosts ? { total: total.sort } : {}) },
      card: (
        <CatalogCardBody
          title={po.number}
          titleIcon={ClipboardList}
          titleHref={`/purchasing/${po.id}`}
          description={po.supplier.name}
          footer={showCosts ? <span className={total.text === "Not yet priced" ? "text-sm font-normal text-muted-foreground" : "text-base font-semibold"}>{total.text}</span> : undefined}
          statusBadge={status}
        />
      ),
      listRow: (
        <>
          <TableCell className="px-3 py-3">
            <Link href={`/purchasing/${po.id}`} className="font-semibold text-primary hover:underline">
              {po.number}
            </Link>
          </TableCell>
          <TableCell className="px-3 py-3 text-sm">{po.supplier.name}</TableCell>
          <TableCell className="px-3 py-3">{status}</TableCell>
          <TableCell className="px-3 py-3 text-sm">{po.items.length}</TableCell>
          {showCosts && <TableCell className={`px-3 py-3 text-sm ${total.text === "Not yet priced" ? "text-muted-foreground" : "font-semibold"}`}>{total.text}</TableCell>}
          <TableCell className="px-3 py-3">
            <div className="flex justify-end">
              <IconTip label="Download PDF">
                <Button variant="ghost" size="icon" render={<a href={`/purchasing/${po.id}/pdf`} download />} nativeButton={false} aria-label={`Download PDF for ${po.number}`}>
                  <Download className="size-4" aria-hidden />
                </Button>
              </IconTip>
            </div>
          </TableCell>
        </>
      ),
    };
  });
  const sortOptions: CatalogSortOption[] = [
    { value: "newest", label: "Newest First", key: "newest", direction: "desc" },
    { value: "number", label: "Order number", key: "number" },
    ...(showCosts ? [{ value: "total", label: "Total (High–Low)", key: "total", direction: "desc" as const }] : []),
  ];

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

      <CatalogBrowser
        entries={entries}
        columns={["Order", "Supplier", "Status", "Items", ...(showCosts ? ["Total"] : []), "Actions"]}
        richList
        gridColumnsClassName={CATALOG_GRID_CLASSNAME}
        searchPlaceholder="Search orders or suppliers…"
        emptyLabel={`No purchase orders${filter ? ` that are ${PO_STATUS_LABEL[filter].toLowerCase()}` : " yet"}.`}
        sortOptions={sortOptions}
        defaultView="list"
        filters={
          <div key="status-filter" className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            <Button size="md" variant={filter ? "outline" : "default"} render={<Link href="/purchasing" />} nativeButton={false}>
              All
            </Button>
            {STATUSES.map((s) => (
              <Button key={s} size="md" variant={filter === s ? "default" : "outline"} render={<Link href={`/purchasing?status=${s}`} />} nativeButton={false}>
                {PO_STATUS_LABEL[s]}
              </Button>
            ))}
          </div>
        }
      />
    </div>
  );
}
