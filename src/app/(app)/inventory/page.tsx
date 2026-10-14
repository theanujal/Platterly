import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { getActiveLocation } from "@/modules/locations/active-location";
import { listLocations } from "@/modules/locations/locations";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { listInventoryItems } from "@/modules/inventory/inventory";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { SectionTabs } from "@/components/app-shell/section-tabs";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { CATALOG_GRID_CLASSNAME, CatalogCardBody, CatalogCardMedia, CatalogNameCell } from "@/components/catalog/catalog-display";
import { CatalogBrowser, type CatalogEntry, type CatalogFilterOption, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { expiryByItem } from "@/modules/inventory/batches";
import { sharedOrAt } from "@/modules/locations/scope";
import { valueStock } from "@/modules/inventory/valuation";
import { listSupplierOptions } from "@/modules/suppliers/supplier";
import { AddInventoryDialog } from "./_components/add-inventory-dialog";
import { AddInventoryMenu } from "./_components/add-inventory-menu";
import { listIngredientCatalog } from "@/modules/inventory/catalog/catalog";
import { InventoryCardActions } from "./_components/inventory-card-actions";
import type { InventoryFormValues } from "./_components/inventory-form";

export const metadata: Metadata = {
  title: "Inventory — Caterly",
  robots: { index: false, follow: false },
};

// Shared neutral/info/warning/success/danger legend (AJ, 2026-09-19) — Low
// Stock used to render "secondary" (the same neutral gray as an inactive
// item), when it's actually a caution state, not a neutral one.
function stockStatus(stock: number, threshold: number | null) {
  if (stock <= 0) return { label: "Out of Stock", variant: "danger" as const };
  if (threshold !== null && stock <= threshold) return { label: "Low Stock", variant: "warning" as const };
  return { label: "In Stock", variant: "success" as const };
}

function toDateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const formatRupeesPlain = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function InventoryPage() {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ inventory: ["view"] }, organizationId);
  const active = await getActiveLocation(organizationId, session.user.id);
  const [items, supplierOptions, allLocations, catalog] = await Promise.all([
    listInventoryItems(organizationId, active.locationId),
    listSupplierOptions(organizationId),
    active.enabled ? listLocations(organizationId) : Promise.resolve([]),
    listIngredientCatalog(organizationId, active.locationId),
  ]);
  const [expiry, valuation] = await Promise.all([expiryByItem(organizationId, items.map((i) => i.id)), valueStock(organizationId, sharedOrAt(active.locationId))]);
  const canEditStock = await hasPermission({ inventory: ["edit"] }, organizationId);
  const locations = active.enabled ? allLocations.map((l) => ({ id: l.id, name: l.name })) : null;
  const locationName = new Map(allLocations.map((l) => [l.id, l.name]));

  const entries: CatalogEntry[] = items.map((item) => {
    const stock = Number(item.stockCount);
    const threshold = item.lowStockThreshold !== null ? Number(item.lowStockThreshold) : null;
    const status = stockStatus(stock, threshold);

    const initialValues: InventoryFormValues = {
      name: item.name,
      category: item.category,
      description: item.description ?? "",
      unit: item.unit,
      lowStockThreshold: item.lowStockThreshold?.toString() ?? "",
      costPerUnit: item.costPerUnit?.toString() ?? "",
      storageLocation: item.storageLocation ?? "",
      supplierId: item.supplierId ?? "",
      kitchenId: item.kitchenId ?? "",
      expiryDate: toDateInputValue(item.expiryDate),
      tracksExpiry: item.tracksExpiry,
      imageUrl: item.image,
    };

    return {
      id: item.id,
      searchText: `${item.name} ${item.category} ${item.storageLocation ?? ""} ${item.supplier?.name ?? ""}`,
      filterValues: { category: item.category, status: status.label },
      sortValues: { name: item.name, stock, newest: item.createdAt.getTime() },
      card: (
        <>
          <CatalogCardMedia
            src={item.image}
            icon={Boxes}
            overlay={
              <>
                <Badge variant="outline" className="h-10 border-transparent bg-background px-3.5 text-sm text-foreground shadow-sm">
                  {item.category}
                </Badge>
                <InventoryCardActions itemId={item.id} name={item.name} unit={item.unit} currentStock={stock} initialValues={initialValues} suppliers={supplierOptions} locations={locations} />
              </>
            }
          />
          <CatalogCardBody
            title={item.name}
            description={item.description}
            footer={
              <span className="text-base font-semibold">
                {stock} {item.unit}
              </span>
            }
            statusBadge={<Badge variant={status.variant}>{status.label}</Badge>}
          />
        </>
      ),
      listRow: (
        <>
          <TableCell className="px-3 py-3">
            <CatalogNameCell name={item.name} description={item.description} src={item.image} icon={Boxes} />
          </TableCell>
          <TableCell className="px-3 py-3">
            <Badge variant="outline">{item.category}</Badge>
          </TableCell>
          <TableCell className="px-3 py-3 text-sm font-semibold">
            {stock} {item.unit}
          </TableCell>
          <TableCell className="px-3 py-3 text-sm">{item.costPerUnit !== null ? `₹${Number(item.costPerUnit).toFixed(2)}` : "—"}</TableCell>
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">{[item.kitchenId ? locationName.get(item.kitchenId) : null, item.storageLocation].filter(Boolean).join(" · ") || "—"}</TableCell>
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">{expiry.get(item.id)?.earliest ? formatDate(expiry.get(item.id)!.earliest!) : "—"}</TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={status.variant}>{status.label}</Badge>
              {expiry.get(item.id)?.expired && <Badge variant="danger">Expired stock</Badge>}
              {!expiry.get(item.id)?.expired && expiry.get(item.id)?.expiringSoon && <Badge variant="warning">Expires soon</Badge>}
            </div>
          </TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex justify-end">
              <InventoryCardActions itemId={item.id} name={item.name} unit={item.unit} currentStock={stock} initialValues={initialValues} suppliers={supplierOptions} locations={locations} variant="plain" canEdit={canEditStock} />
            </div>
          </TableCell>
        </>
      ),
    };
  });

  const expiredItems = items.filter((i) => expiry.get(i.id)?.expired).map((i) => i.name);
  const soonItems = items.filter((i) => !expiry.get(i.id)?.expired && expiry.get(i.id)?.expiringSoon).map((i) => i.name);
  const categories = [...new Set(items.map((item) => item.category))].sort();
  const filterOptions: CatalogFilterOption[] = [
    { key: "category", allLabel: "Category", options: categories.map((c) => ({ value: c, label: c })) },
    {
      key: "status",
      allLabel: "Status",
      options: [
        { value: "In Stock", label: "In Stock" },
        { value: "Low Stock", label: "Low Stock" },
        { value: "Out of Stock", label: "Out of Stock" },
      ],
    },
  ];

  const sortOptions: CatalogSortOption[] = [
    { value: "newest", label: "Newest First", key: "newest", direction: "desc" },
    { value: "name", label: "Name (A–Z)", key: "name" },
    { value: "stock-low", label: "Stock (Low–High)", key: "stock" },
    { value: "stock-high", label: "Stock (High–Low)", key: "stock", direction: "desc" },
  ];

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Stock & Supplies" }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Stock & Supplies</h1>
          <p className="text-sm text-muted-foreground">Track stock on hand, low-stock alerts, and supplier contacts.</p>
        </div>
        <AddInventoryMenu suppliers={supplierOptions} locations={locations} catalog={catalog} />
      </div>
      <SectionTabs group="stock" active="/inventory" organizationId={organizationId} />

      <p data-testid="stock-value" className="text-sm text-muted-foreground">
        Stock value: <span className="font-semibold text-foreground">{formatRupeesPlain(valuation.totalValue)}</span> (batch cost x quantity left)
        {valuation.incomplete ? ` · incomplete: ${valuation.itemsWithUnknownCost} ${valuation.itemsWithUnknownCost === 1 ? "item has" : "items have"} stock with no known cost, which is not valued` : ""}
      </p>

      {(expiredItems.length > 0 || soonItems.length > 0) && (
        <div role="status" data-testid="expiry-banner" className="flex flex-col gap-1 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {expiredItems.length > 0 && (
            <p>
              <span className="font-semibold">Expired stock:</span> {expiredItems.join(", ")}. It is not used automatically; open the item&apos;s Batches to see it, or write it off with an adjustment.
            </p>
          )}
          {soonItems.length > 0 && (
            <p>
              <span className="font-semibold">Expiring within 7 days:</span> {soonItems.join(", ")}. Use the batch that expires first.
            </p>
          )}
        </div>
      )}

      <CatalogBrowser
        entries={entries}
        addTile={<AddInventoryDialog variant="tile" suppliers={supplierOptions} locations={locations} />}
        columns={["Item", "Category", "Stock", "Cost / Unit", "Storage", "Expiry", "Status", "Actions"]}
        richList
        gridColumnsClassName={CATALOG_GRID_CLASSNAME}
        searchPlaceholder="Search inventory…"
        emptyLabel="No inventory items yet."
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        defaultView="list"
      />
    </div>
  );
}
