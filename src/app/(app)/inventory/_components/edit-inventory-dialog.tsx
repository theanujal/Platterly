"use client";

import { useRouter } from "next/navigation";
import { FormDrawer } from "@/components/catalog/form-drawer";
import { InventoryForm, type InventoryFormValues } from "./inventory-form";
import { updateInventoryItemAction } from "../actions";

interface EditInventoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  initialValues: InventoryFormValues;
  suppliers: { id: string; name: string }[];
  locations?: { id: string; name: string }[] | null;
}

export function EditInventoryDialog({ open, onOpenChange, itemId, initialValues, suppliers, locations }: EditInventoryDialogProps) {
  const router = useRouter();

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Edit Inventory Item">
      <InventoryForm
        initialValues={initialValues}
        suppliers={suppliers}
        locations={locations}
        submitLabel="Save changes"
        onSubmit={(formData) => updateInventoryItemAction(itemId, initialValues.imageUrl ?? undefined, formData)}
        onCancel={() => onOpenChange(false)}
        onSuccess={() => {
          onOpenChange(false);
          router.refresh();
        }}
      />
    </FormDrawer>
  );
}
