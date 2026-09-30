"use client";

import { useRouter } from "next/navigation";
import { AddDrawer } from "@/components/catalog/form-drawer";
import { MenuForm } from "./menu-form";
import { createMenuAction } from "../actions";

export function AddMenuDialog({ categories, variant = "button" }: { categories: { id: string; name: string }[]; variant?: "button" | "tile" }) {
  const router = useRouter();

  return (
    <AddDrawer
      variant={variant}
      buttonLabel="Add Menu Type"
      tileLabel="Add New Menu Type"
      tileDescription="Build a priced, sellable menu"
      title="New Menu Type"
      description="Details and pricing on the left, the categories it offers on the right."
      size="xl"
    >
      {(close) => (
        <MenuForm
          categories={categories}
          submitLabel="Create menu"
          onSubmit={createMenuAction}
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
