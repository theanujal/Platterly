import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listInventoryItems } from "@/modules/inventory/inventory";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry } from "@/components/catalog/catalog-browser";
import { AddInventoryDialog } from "./_components/add-inventory-dialog";
import { InventoryCardActions } from "./_components/inventory-card-actions";
import type { InventoryFormValues } from "./_components/inventory-form";

export const metadata: Metadata = {
  title: "Inventory — Platterly",
  robots: { index: false, follow: false },
};

function stockStatus(stock: number, threshold: number | null) {
  if (stock <= 0) return { label: "Out of Stock", variant: "destructive" as const };
  if (threshold !== null && stock <= threshold) return { label: "Low Stock", variant: "secondary" as const };
  return { label: "In Stock", variant: "default" as const };
}

function toDateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
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
          <TableCell className="font-medium">{item.name}</TableCell>
          <TableCell>{item.category}</TableCell>
          <TableCell>
            {stock} {item.unit}
          </TableCell>
          <TableCell>{item.storageLocation ?? "—"}</TableCell>
          <TableCell>
            <Badge variant={status.variant}>{status.label}</Badge>
          </TableCell>
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

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Inventory</h1>
          <p className="text-sm text-muted-foreground">Track stock on hand, low-stock alerts, and supplier contacts.</p>
        </div>
        <AddInventoryDialog />
      </div>

      <CatalogBrowser
        entries={entries}
        addTile={<AddInventoryDialog variant="tile" />}
        columns={["Name", "Category", "Stock", "Location", "Status", "Actions"]}
        searchPlaceholder="Search inventory…"
        emptyLabel="No inventory items yet."
      />
    </div>
  );
}
