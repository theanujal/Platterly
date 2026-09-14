"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CategoryForm, type CategoryFormValues } from "./category-form";
import { updateCategoryAction, getCategoryMenuAssignmentsAction } from "../actions";

interface EditCategoryDialogProps {
  categoryId: string;
  name: string;
  initialValues: Omit<CategoryFormValues, "menuAssignments">;
  availableMenus: { id: string; name: string }[];
}

export function EditCategoryDialog({ categoryId, name, initialValues, availableMenus }: EditCategoryDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // undefined = not loaded yet; the form only renders once this resolves,
  // so its initial state is seeded correctly on first render rather than
  // being reset out from under the user after mount.
  const [menuAssignments, setMenuAssignments] = useState<CategoryFormValues["menuAssignments"] | undefined>(undefined);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && menuAssignments === undefined) {
      getCategoryMenuAssignmentsAction(categoryId).then((assignments) => {
        setMenuAssignments(
          availableMenus.map((menu) => {
            const existing = assignments.find((a) => a.menuId === menu.id);
            return { menuId: menu.id, checked: !!existing, maxSelection: existing?.maxSelection?.toString() ?? "" };
          }),
        );
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${name}`} />}>
        <Pencil className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Menu Category</DialogTitle>
        </DialogHeader>
        {menuAssignments === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <CategoryForm
            availableMenus={availableMenus}
            initialValues={{ ...initialValues, menuAssignments }}
            submitLabel="Save changes"
            onSubmit={(input) => updateCategoryAction(categoryId, input)}
            onSuccess={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
