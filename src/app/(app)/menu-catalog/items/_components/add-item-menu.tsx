"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronDown, Download, FileSpreadsheet, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormDrawer } from "@/components/catalog/form-drawer";
import { ItemForm } from "./item-form";
import { ImportItemsDrawer } from "./import-items-drawer";
import { CatalogPickerDrawer, type CatalogOption } from "./catalog-picker-drawer";
import { createMenuItemAction } from "../actions";

/** "Add Item" with a chevron for the two bulk ways in: Excel/CSV import and Platterly's ready-made catalog (AJ, 2026-10-10). */
export function AddItemMenu({
  categories,
  menus,
  catalog,
}: {
  categories: { id: string; name: string }[];
  menus: { id: string; name: string }[];
  catalog: CatalogOption[];
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
          <DropdownMenuTrigger render={<Button aria-label="Bulk add options" className="rounded-l-none border-l border-primary-foreground/30 px-3" />}>
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setOpen("catalog")}>
              <BookOpen /> Add from Platterly catalog
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOpen("import")}>
              <FileSpreadsheet /> Import from Excel / CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <FormDrawer open={open === "item"} onOpenChange={(o) => !o && close()} title="New Food Item" size="xl">
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
      </FormDrawer>
      <ImportItemsDrawer open={open === "import"} onClose={close} />
      <CatalogPickerDrawer open={open === "catalog"} onClose={close} catalog={catalog} />
    </>
  );
}

export function TemplateLinks() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" render={<a href="/menu-catalog/items/template?format=xlsx" download />} nativeButton={false}>
        <Download /> Excel template
      </Button>
      <Button variant="outline" size="sm" render={<a href="/menu-catalog/items/template?format=csv" download />} nativeButton={false}>
        <Download /> CSV template
      </Button>
    </div>
  );
}
