import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listInventoryItems } from "@/modules/inventory/inventory";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
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
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image} alt="" className="aspect-video w-full object-cover" />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-muted">
              <Boxes className="size-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex flex-col gap-1.5 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{item.name}</span>
              <InventoryCardActions
                itemId={item.id}
                name={item.name}
                unit={item.unit}
                currentStock={stock}
                initialValues={initialValues}
              />
            </div>
            <Badge variant="outline" className="w-fit">
              {item.category}
            </Badge>
            <div className="flex items-center gap-1.5 pt-1">
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <span className="pt-1 text-sm font-semibold">
              {stock} {item.unit}
            </span>
          </div>
        </>
      ),
      listRow: (
        <>
          <TableCell>
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt="" className="size-10 rounded-md border border-border object-cover" />
            ) : (
              <div className="flex size-10 items-center justify-center rounded-md border border-border bg-muted">
                <Boxes className="size-4 text-muted-foreground" />
              </div>
            )}
          </TableCell>
          <TableCell className="font-medium">{item.name}</TableCell>
          <TableCell>{item.category}</TableCell>
          <TableCell>
            {stock} {item.unit}
          </TableCell>
          <TableCell>{item.costPerUnit !== null ? `₹${Number(item.costPerUnit).toFixed(2)}` : "—"}</TableCell>
          <TableCell>{item.storageLocation ?? "—"}</TableCell>
          <TableCell>{item.expiryDate ? formatDate(item.expiryDate) : "—"}</TableCell>
          <TableCell>
            <InventoryCardActions
              itemId={item.id}
              name={item.name}
              unit={item.unit}
              currentStock={stock}
              initialValues={initialValues}
            />
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
        columns={["Image", "Name", "Category", "Stock", "Cost/Unit", "Storage Location", "Expiry", "Actions"]}
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
