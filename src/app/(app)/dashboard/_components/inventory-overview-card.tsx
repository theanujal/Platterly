import { Package, TriangleAlert, CircleX } from "lucide-react";
import { getInventoryOverviewStats, listLowStockItems } from "@/modules/inventory/inventory";
import { StatusOverviewCard } from "./status-overview-card";

// Chunk 5 Group 5.5 placeholder shell, wired to real data in Chunk 7
// (Inventory, Basic), redesigned to a reference screenshot's "Inventory
// Status" look (AJ, 2026-09-16) — same StatusOverviewCard shell the new
// Partial Payments card uses.
export async function InventoryOverviewCard({ organizationId }: { organizationId: string }) {
  const [stats, lowStockItems] = await Promise.all([
    getInventoryOverviewStats(organizationId),
    listLowStockItems(organizationId),
  ]);

  return (
    <StatusOverviewCard
      tone="teal"
      title="Inventory Status"
      icon={Package}
      primaryLabel="Total Items"
      primaryValue={String(stats.totalItems)}
      progressPercent={stats.totalItems === 0 ? 0 : (stats.inStock / stats.totalItems) * 100}
      redChip={{ icon: TriangleAlert, label: "Low Stock", value: stats.lowStock }}
      orangeChip={{ icon: CircleX, label: "Expired", value: stats.expired }}
      rows={lowStockItems.slice(0, 2).map((item) => ({
        key: item.id,
        title: item.name,
        subtitle: `${Number(item.stockCount)} ${item.unit}`,
        badgeLabel: "Low stock",
      }))}
      emptyMessage="No items are low on stock."
      footerHref="/inventory"
      footerLabel="Manage inventory"
    />
  );
}
