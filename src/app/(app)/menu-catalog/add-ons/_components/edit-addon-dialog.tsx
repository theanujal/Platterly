"use client";

import { useRouter } from "next/navigation";
import { FormDrawer } from "@/components/catalog/form-drawer";
import { AddOnForm, type AddOnFormValues } from "./addon-form";
import { updateAddOnAction } from "../actions";

interface EditAddOnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addOnId: string;
  initialValues: AddOnFormValues;
  availableMenus: { id: string; name: string }[];
}

export function EditAddOnDialog({ open, onOpenChange, addOnId, initialValues, availableMenus }: EditAddOnDialogProps) {
  const router = useRouter();

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Edit Add-on">
      <AddOnForm
        initialValues={initialValues}
        availableMenus={availableMenus}
        submitLabel="Save changes"
        onSubmit={(formData) => updateAddOnAction(addOnId, initialValues.imageUrl ?? undefined, formData)}
        onCancel={() => onOpenChange(false)}
        onSuccess={() => {
          onOpenChange(false);
          router.refresh();
        }}
      />
    </FormDrawer>
  );
}
