"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ItemForm, type ItemFormValues } from "./item-form";
import { updateMenuItemAction } from "../actions";

interface EditItemDialogProps {
  itemId: string;
  name: string;
  initialValues: ItemFormValues;
  categories: { id: string; name: string }[];
  menus: { id: string; name: string }[];
}

export function EditItemDialog({ itemId, name, initialValues, categories, menus }: EditItemDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${name}`} />}>
        <Pencil className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Food Item</DialogTitle>
        </DialogHeader>
        <ItemForm
          categories={categories}
          menus={menus}
          initialValues={initialValues}
          submitLabel="Save changes"
          onSubmit={(formData) => updateMenuItemAction(itemId, initialValues.imageUrl ?? undefined, formData)}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
