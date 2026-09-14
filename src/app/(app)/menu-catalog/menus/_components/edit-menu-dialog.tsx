"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MenuForm, type MenuFormValues, type AssignedCategory } from "./menu-form";
import { updateMenuAction, reorderMenuCategoriesAction } from "../actions";

interface EditMenuDialogProps {
  menuId: string;
  name: string;
  initialValues: MenuFormValues;
  assignedCategories: AssignedCategory[];
}

export function EditMenuDialog({ menuId, name, initialValues, assignedCategories }: EditMenuDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${name}`} />}>
        <Pencil className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Menu Type</DialogTitle>
        </DialogHeader>
        <MenuForm
          initialValues={initialValues}
          assignedCategories={assignedCategories}
          onReorderCategories={(orderedCategoryIds) => reorderMenuCategoriesAction(menuId, orderedCategoryIds)}
          submitLabel="Save changes"
          onSubmit={(formData) => updateMenuAction(menuId, initialValues.imageUrl ?? undefined, formData)}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
