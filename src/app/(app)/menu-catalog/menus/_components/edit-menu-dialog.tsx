"use client";

import { useRouter } from "next/navigation";
import { FormDrawer } from "@/components/catalog/form-drawer";
import { MenuForm, type MenuFormValues, type AssignedCategory } from "./menu-form";
import { updateMenuAction } from "../actions";

interface EditMenuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuId: string;
  initialValues: MenuFormValues;
  categories: { id: string; name: string }[];
  assignedCategories: AssignedCategory[];
}

export function EditMenuDialog({ open, onOpenChange, menuId, initialValues, categories, assignedCategories }: EditMenuDialogProps) {
  const router = useRouter();

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Menu Type"
      description="Details and pricing on the left, the categories it offers on the right."
      size="xl"
    >
      <MenuForm
        initialValues={initialValues}
        categories={categories}
        assignedCategories={assignedCategories}
        submitLabel="Save changes"
        onSubmit={(formData) => updateMenuAction(menuId, initialValues.imageUrl ?? undefined, formData)}
        onCancel={() => onOpenChange(false)}
        onSuccess={() => {
          onOpenChange(false);
          router.refresh();
        }}
      />
    </FormDrawer>
  );
}
