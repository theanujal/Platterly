"use client";

import { useRouter } from "next/navigation";
import { AddDrawer } from "@/components/catalog/form-drawer";
import { InventoryForm } from "./inventory-form";
import { createInventoryItemAction } from "../actions";

export function AddInventoryDialog({ variant = "button" }: { variant?: "button" | "tile" }) {
  const router = useRouter();

  return (
    <AddDrawer variant={variant} buttonLabel="Add Item" tileLabel="Add New Item" tileDescription="Track a new item in stock" title="New Inventory Item">
      {(close) => (
        <InventoryForm
          showOpeningStock
          submitLabel="Create item"
          onSubmit={createInventoryItemAction}
          onCancel={close}
          onSuccess={() => {
            close();
            router.refresh();
          }}
        />
      )}
    </AddDrawer>
  );
}
