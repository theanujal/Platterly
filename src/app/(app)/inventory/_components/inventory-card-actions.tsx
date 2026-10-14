"use client";

import { useState } from "react";
import { Layers, PackagePlus } from "lucide-react";
import { CatalogCardMenu } from "@/components/catalog/catalog-card-menu";
import { EditInventoryDialog } from "./edit-inventory-dialog";
import { BatchesDrawer } from "./batches-drawer";
import { StockTransactionDialog } from "./stock-transaction-dialog";
import type { InventoryFormValues } from "./inventory-form";
import { deleteInventoryItemAction } from "../actions";

interface InventoryCardActionsProps {
  itemId: string;
  name: string;
  unit: string;
  currentStock: number;
  initialValues: InventoryFormValues;
  suppliers: { id: string; name: string }[];
  locations?: { id: string; name: string }[] | null;
  variant?: "overlay" | "plain";
  canEdit?: boolean;
}

/** 3-dot menu on an inventory card, or the Stock / Edit / Delete icons on a list row. Stock and Edit open drawers. */
export function InventoryCardActions({ itemId, name, unit, currentStock, initialValues, suppliers, locations, variant, canEdit = true }: InventoryCardActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [batchesOpen, setBatchesOpen] = useState(false);

  return (
    <>
      <CatalogCardMenu
        name={name}
        entityLabel="Item"
        variant={variant}
        extraActions={[
          { label: "Stock In / Out", ariaLabel: `Record stock movement for ${name}`, icon: PackagePlus, onClick: () => setStockOpen(true) },
          { label: "Batches", ariaLabel: `View batches of ${name}`, icon: Layers, onClick: () => setBatchesOpen(true) },
        ]}
        onEdit={() => setEditOpen(true)}
        onDelete={() => deleteInventoryItemAction(itemId)}
        deleteDescription="This inventory item and its stock history will be permanently removed."
      />
      <StockTransactionDialog open={stockOpen} onOpenChange={setStockOpen} itemId={itemId} name={name} unit={unit} currentStock={currentStock} tracksExpiry={initialValues.tracksExpiry} />
      <BatchesDrawer open={batchesOpen} onOpenChange={setBatchesOpen} itemId={itemId} name={name} unit={unit} canEdit={canEdit} />
      <EditInventoryDialog open={editOpen} onOpenChange={setEditOpen} itemId={itemId} initialValues={initialValues} suppliers={suppliers} locations={locations} />
    </>
  );
}
