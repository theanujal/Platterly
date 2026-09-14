"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CATALOG_ADD_TILE_CLASSNAME } from "@/components/catalog/catalog-browser";
import { InventoryForm } from "./inventory-form";
import { createInventoryItemAction } from "../actions";

export function AddInventoryDialog({ variant = "button" }: { variant?: "button" | "tile" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {variant === "tile" ? (
        <DialogTrigger className={CATALOG_ADD_TILE_CLASSNAME}>
          <Plus className="size-6" />
          <span className="text-sm font-medium">Add New Item</span>
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus className="size-4" />
          Add Item
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Inventory Item</DialogTitle>
        </DialogHeader>
        <InventoryForm
          showOpeningStock
          submitLabel="Create item"
          onSubmit={createInventoryItemAction}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
