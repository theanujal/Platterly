"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FormDrawer } from "@/components/catalog/form-drawer";
import { CategoryForm, type CategoryFormValues } from "./category-form";
import { updateCategoryAction, getCategoryMenuAssignmentsAction } from "../actions";

interface EditCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  initialValues: Omit<CategoryFormValues, "menuAssignments">;
  availableMenus: { id: string; name: string }[];
}

export function EditCategoryDialog({ open, onOpenChange, categoryId, initialValues, availableMenus }: EditCategoryDialogProps) {
  const router = useRouter();
  // undefined = not loaded yet; the form only renders once this resolves,
  // so its initial state is seeded correctly on first render rather than
  // being reset out from under the user after mount.
  const [menuAssignments, setMenuAssignments] = useState<CategoryFormValues["menuAssignments"] | undefined>(undefined);

  useEffect(() => {
    if (open && menuAssignments === undefined) {
      getCategoryMenuAssignmentsAction(categoryId).then((assignments) => {
        setMenuAssignments(
          availableMenus.map((menu) => {
            const existing = assignments.find((a) => a.menuId === menu.id);
            return { menuId: menu.id, checked: !!existing, maxSelection: existing?.maxSelection?.toString() ?? "" };
          }),
        );
      });
    }
  }, [open, menuAssignments, categoryId, availableMenus]);

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Edit Menu Category">
      {menuAssignments === undefined ? (
        <p className="p-5 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <CategoryForm
          availableMenus={availableMenus}
          initialValues={{ ...initialValues, menuAssignments }}
          submitLabel="Save changes"
          onSubmit={(input) => updateCategoryAction(categoryId, input)}
          onCancel={() => onOpenChange(false)}
          onSuccess={() => {
            onOpenChange(false);
            setMenuAssignments(undefined);
            router.refresh();
          }}
        />
      )}
    </FormDrawer>
  );
}
