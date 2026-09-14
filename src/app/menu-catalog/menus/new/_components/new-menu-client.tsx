"use client";

import { useRouter } from "next/navigation";
import { MenuForm } from "../../_components/menu-form";
import { createMenuAction } from "../../actions";

export function NewMenuClient({ availableItems }: { availableItems: { id: string; name: string }[] }) {
  const router = useRouter();

  return (
    <MenuForm
      availableItems={availableItems}
      submitLabel="Create menu"
      onSubmit={createMenuAction}
      onSuccess={() => router.push("/menu-catalog/menus")}
    />
  );
}
