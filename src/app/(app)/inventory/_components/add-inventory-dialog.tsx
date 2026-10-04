"use client";

import { useRouter } from "next/navigation";
import { AddDrawer } from "@/components/catalog/form-drawer";
import { InventoryForm } from "./inventory-form";
import { createInventoryItemAction } from "../actions";

export function AddInventoryDialog({ variant = "button", suppliers, locations }: { variant?: "button" | "tile"; suppliers: { id: string; name: string }[]; locations?: { id: string; name: string }[] | null }) {
  const router = useRouter();

  return (
    <AddDrawer variant={variant} buttonLabel="Add Item" tileLabel="Add New Item" tileDescription="Track a new item in stock" title="New Inventory Item">
      {(close) => (
        <InventoryForm
          showOpeningStock
          suppliers={suppliers}
          locations={locations}
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
