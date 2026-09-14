"use client";

import { useRouter } from "next/navigation";
import { MenuForm } from "../../_components/menu-form";
import { createMenuAction } from "../../actions";

interface NewMenuClientProps {
  availableItems: { id: string; name: string }[];
  availableCategories: { id: string; name: string }[];
}

export function NewMenuClient({ availableItems, availableCategories }: NewMenuClientProps) {
  const router = useRouter();

  return (
    <MenuForm
      availableItems={availableItems}
      availableCategories={availableCategories}
      submitLabel="Create menu"
      onSubmit={createMenuAction}
      onSuccess={() => router.push("/menu-catalog/menus")}
    />
  );
}
