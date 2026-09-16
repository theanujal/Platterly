"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CATALOG_ADD_TILE_CLASSNAME, CatalogAddTileContent } from "@/components/catalog/catalog-browser";
import { MenuForm } from "./menu-form";
import { createMenuAction } from "../actions";

export function AddMenuDialog({ variant = "button" }: { variant?: "button" | "tile" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {variant === "tile" ? (
        <DialogTrigger className={CATALOG_ADD_TILE_CLASSNAME}>
          <CatalogAddTileContent label="Add New Menu Type" description="Build a priced, sellable menu" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <Plus className="size-4" />
          Add Menu Type
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Menu Type</DialogTitle>
        </DialogHeader>
        <MenuForm
          submitLabel="Create menu"
          onSubmit={createMenuAction}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
