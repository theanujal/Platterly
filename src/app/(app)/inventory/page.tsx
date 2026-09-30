import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listInventoryItems } from "@/modules/inventory/inventory";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { CATALOG_GRID_CLASSNAME, CatalogCardBody, CatalogCardMedia, CatalogNameCell } from "@/components/catalog/catalog-display";
import { CatalogBrowser, type CatalogEntry, type CatalogFilterOption, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { AddInventoryDialog } from "./_components/add-inventory-dialog";
import { InventoryCardActions } from "./_components/inventory-card-actions";
import type { InventoryFormValues } from "./_components/inventory-form";

export const metadata: Metadata = {
  title: "Inventory — Platterly",
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

export default async function InventoryPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["view"] }, organizationId);
  const items = await listInventoryItems(organizationId);

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
      supplierName: item.supplierName ?? "",
      supplierContact: item.supplierContact ?? "",
      expiryDate: toDateInputValue(item.expiryDate),
      imageUrl: item.image,
    };

    return {
      id: item.id,
      searchText: `${item.name} ${item.category} ${item.storageLocation ?? ""} ${item.supplierName ?? ""}`,
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
                <InventoryCardActions itemId={item.id} name={item.name} unit={item.unit} currentStock={stock} initialValues={initialValues} />
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
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">{item.storageLocation ?? "—"}</TableCell>
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">{item.expiryDate ? formatDate(item.expiryDate) : "—"}</TableCell>
          <TableCell className="px-3 py-3">
            <Badge variant={status.variant}>{status.label}</Badge>
          </TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex justify-end">
              <InventoryCardActions itemId={item.id} name={item.name} unit={item.unit} currentStock={stock} initialValues={initialValues} variant="plain" />
            </div>
          </TableCell>
        </>
      ),
    };
  });

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
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Inventory" }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="text-sm text-muted-foreground">Track stock on hand, low-stock alerts, and supplier contacts.</p>
        </div>
        <AddInventoryDialog />
      </div>
      <Separator />

      <CatalogBrowser
        entries={entries}
        addTile={<AddInventoryDialog variant="tile" />}
        columns={["Item", "Category", "Stock", "Cost / Unit", "Storage", "Expiry", "Status", "Actions"]}
        richList
        gridColumnsClassName={CATALOG_GRID_CLASSNAME}
        searchPlaceholder="Search inventory…"
        emptyLabel="No inventory items yet."
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        pageSize={16}
        defaultView="list"
      />
    </div>
  );
}
