"use client";

import { useRouter } from "next/navigation";
import { AddDrawer } from "@/components/catalog/form-drawer";
import { CategoryForm } from "./category-form";
import { createCategoryAction } from "../actions";

interface AddCategoryDialogProps {
  availableMenus: { id: string; name: string }[];
  /** "button" = compact top-right trigger; "tile" = the dashed grid Add tile. Both open their own independent drawer. */
  variant?: "button" | "tile";
}

export function AddCategoryDialog({ availableMenus, variant = "button" }: AddCategoryDialogProps) {
  const router = useRouter();

  return (
    <AddDrawer
      variant={variant}
      buttonLabel="Add Category"
      tileLabel="Add New Category"
      tileDescription="Group your food items together"
      title="New Menu Category"
    >
      {(close) => (
        <CategoryForm
          availableMenus={availableMenus}
          submitLabel="Create category"
          onSubmit={createCategoryAction}
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
