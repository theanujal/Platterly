"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CATALOG_ADD_TILE_CLASSNAME } from "@/components/catalog/catalog-browser";
import { ItemForm } from "./item-form";
import { createMenuItemAction } from "../actions";

interface AddItemDialogProps {
  categories: { id: string; name: string }[];
  menus: { id: string; name: string }[];
  variant?: "button" | "tile";
}

export function AddItemDialog({ categories, menus, variant = "button" }: AddItemDialogProps) {
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Food Item</DialogTitle>
        </DialogHeader>
        <ItemForm
          categories={categories}
          menus={menus}
          submitLabel="Create item"
          onSubmit={createMenuItemAction}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
