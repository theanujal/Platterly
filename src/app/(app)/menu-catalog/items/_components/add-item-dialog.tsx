"use client";

import { useRouter } from "next/navigation";
import { AddDrawer } from "@/components/catalog/form-drawer";
import { ItemForm } from "./item-form";
import { createMenuItemAction } from "../actions";

interface AddItemDialogProps {
  categories: { id: string; name: string }[];
  menus: { id: string; name: string }[];
  variant?: "button" | "tile";
}

export function AddItemDialog({ categories, menus, variant = "button" }: AddItemDialogProps) {
  const router = useRouter();

  return (
    <AddDrawer
      variant={variant}
      buttonLabel="Add Item"
      tileLabel="Add New Item"
      tileDescription="Add a new dish to your catalog"
      title="New Food Item"
      size="xl"
    >
      {(close) => (
        <ItemForm
          categories={categories}
          menus={menus}
          submitLabel="Create item"
          onSubmit={createMenuItemAction}
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
