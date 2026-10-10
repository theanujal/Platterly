"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronDown, FileSpreadsheet, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormDrawer } from "@/components/catalog/form-drawer";
import { InventoryForm } from "./inventory-form";
import { ImportInventoryDrawer } from "./import-inventory-drawer";
import { IngredientPickerDrawer, type IngredientOption } from "./ingredient-picker-drawer";
import { createInventoryItemAction } from "../actions";

/** "Add Item" with a chevron for the two bulk ways in: Platterly's ingredient catalog and an Excel/CSV import (AJ, 2026-10-10). */
export function AddInventoryMenu({
  suppliers,
  locations,
  catalog,
}: {
  suppliers: { id: string; name: string }[];
  locations: { id: string; name: string }[] | null;
  catalog: IngredientOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"item" | "import" | "catalog" | null>(null);
  const close = () => setOpen(null);

  return (
    <>
      <div className="inline-flex">
        <Button type="button" className="rounded-r-none" onClick={() => setOpen("item")}>
          <Plus className="size-4" /> Add Item
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button aria-label="Catalog and import options" className="rounded-l-none border-l border-primary-foreground/30 px-3" />}>
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setOpen("catalog")}>
              <BookOpen /> Browse ingredient catalog
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOpen("import")}>
              <FileSpreadsheet /> Import from Excel / CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <FormDrawer open={open === "item"} onOpenChange={(o) => !o && close()} title="New Inventory Item">
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
      </FormDrawer>
      <ImportInventoryDrawer open={open === "import"} onClose={close} />
      <IngredientPickerDrawer open={open === "catalog"} onClose={close} catalog={catalog} />
    </>
  );
}
