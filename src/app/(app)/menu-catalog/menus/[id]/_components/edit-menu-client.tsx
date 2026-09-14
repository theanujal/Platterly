"use client";

import { useRouter } from "next/navigation";
import { MenuForm, type MenuFormValues } from "../../_components/menu-form";
import { updateMenuAction } from "../../actions";

interface EditMenuClientProps {
  menuId: string;
  initialValues: MenuFormValues;
  availableItems: { id: string; name: string }[];
  availableCategories: { id: string; name: string }[];
}

export function EditMenuClient({ menuId, initialValues, availableItems, availableCategories }: EditMenuClientProps) {
  const router = useRouter();

  return (
    <MenuForm
      availableItems={availableItems}
      availableCategories={availableCategories}
      initialValues={initialValues}
      submitLabel="Save changes"
      onSubmit={(formData) => updateMenuAction(menuId, initialValues.imageUrl ?? undefined, formData)}
      onSuccess={() => router.push("/menu-catalog/menus")}
    />
  );
}
