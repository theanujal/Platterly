"use client";

import { useRouter } from "next/navigation";
import { FormDrawer } from "@/components/catalog/form-drawer";
import { ItemForm, type ItemFormValues } from "./item-form";
import { updateMenuItemAction } from "../actions";

interface EditItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  initialValues: ItemFormValues;
  categories: { id: string; name: string }[];
  menus: { id: string; name: string }[];
}

export function EditItemDialog({ open, onOpenChange, itemId, initialValues, categories, menus }: EditItemDialogProps) {
  const router = useRouter();

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Edit Food Item" size="xl">
      <ItemForm
        categories={categories}
        menus={menus}
        initialValues={initialValues}
        submitLabel="Save changes"
        onSubmit={(formData) => updateMenuItemAction(itemId, initialValues.imageUrl ?? undefined, formData)}
        onCancel={() => onOpenChange(false)}
        onSuccess={() => {
          onOpenChange(false);
          router.refresh();
        }}
      />
    </FormDrawer>
  );
}
