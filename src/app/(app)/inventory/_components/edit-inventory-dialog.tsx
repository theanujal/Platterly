"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InventoryForm, type InventoryFormValues } from "./inventory-form";
import { updateInventoryItemAction } from "../actions";

interface EditInventoryDialogProps {
  itemId: string;
  name: string;
  initialValues: InventoryFormValues;
}

export function EditInventoryDialog({ itemId, name, initialValues }: EditInventoryDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${name}`} />}>
        <Pencil className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Inventory Item</DialogTitle>
        </DialogHeader>
        <InventoryForm
          initialValues={initialValues}
          submitLabel="Save changes"
          onSubmit={(formData) => updateInventoryItemAction(itemId, initialValues.imageUrl ?? undefined, formData)}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
