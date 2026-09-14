"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CATALOG_ADD_TILE_CLASSNAME } from "@/components/catalog/catalog-browser";
import { CategoryForm } from "./category-form";
import { createCategoryAction } from "../actions";

interface AddCategoryDialogProps {
  availableMenus: { id: string; name: string }[];
  /** "button" = compact top-right trigger; "tile" = the dashed grid Add tile. Both open their own independent dialog instance. */
  variant?: "button" | "tile";
}

export function AddCategoryDialog({ availableMenus, variant = "button" }: AddCategoryDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {variant === "tile" ? (
        <DialogTrigger className={CATALOG_ADD_TILE_CLASSNAME}>
          <Plus className="size-6" />
          <span className="text-sm font-medium">Add New Category</span>
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus className="size-4" />
          Add Category
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New Menu Category</DialogTitle>
        </DialogHeader>
        <CategoryForm
          availableMenus={availableMenus}
          submitLabel="Create category"
          onSubmit={createCategoryAction}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
