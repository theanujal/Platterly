"use client";

import { useRouter } from "next/navigation";
import { ItemForm } from "../../_components/item-form";
import { createMenuItemAction } from "../../actions";

interface NewItemClientProps {
  categories: { id: string; name: string }[];
  menus: { id: string; name: string }[];
}

export function NewItemClient({ categories, menus }: NewItemClientProps) {
  const router = useRouter();

  return (
    <ItemForm
      categories={categories}
      menus={menus}
      submitLabel="Create item"
      onSubmit={createMenuItemAction}
      onSuccess={() => router.push("/menu-catalog/items")}
    />
  );
}
