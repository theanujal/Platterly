"use client";

import { useRouter } from "next/navigation";
import { ItemForm } from "../../_components/item-form";
import { createMenuItemAction } from "../../actions";

export function NewItemClient({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter();

  return (
    <ItemForm
      categories={categories}
      submitLabel="Create item"
      onSubmit={createMenuItemAction}
      onSuccess={() => router.push("/menu-catalog/items")}
    />
  );
}
