"use client";

import { useRouter } from "next/navigation";
import { ItemForm, type ItemFormValues } from "../../_components/item-form";
import { updateMenuItemAction } from "../../actions";

interface EditItemClientProps {
  itemId: string;
  initialValues: ItemFormValues;
  categories: { id: string; name: string }[];
}

export function EditItemClient({ itemId, initialValues, categories }: EditItemClientProps) {
  const router = useRouter();

  return (
    <ItemForm
      categories={categories}
      initialValues={initialValues}
      submitLabel="Save changes"
      onSubmit={(formData) => updateMenuItemAction(itemId, initialValues.imageUrl ?? undefined, formData)}
      onSuccess={() => router.push("/menu-catalog/items")}
    />
  );
}
