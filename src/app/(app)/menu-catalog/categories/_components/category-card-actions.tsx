"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { EditCategoryDialog } from "./edit-category-dialog";
import type { CategoryFormValues } from "./category-form";
import { deleteCategoryAction } from "../actions";

interface CategoryCardActionsProps {
  categoryId: string;
  name: string;
  initialValues: Omit<CategoryFormValues, "menuAssignments">;
  availableMenus: { id: string; name: string }[];
}

// Replaces the old category-row-actions.tsx (which only ever rendered on a
// now-deleted [id] detail page) — pencil + trash live directly on each
// card/row instead. No stopPropagation needed: since this entity's
// CatalogEntry no longer carries an `href`, the card/row itself isn't
// wrapped in a click target at all.
export function CategoryCardActions({ categoryId, name, initialValues, availableMenus }: CategoryCardActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    await deleteCategoryAction(categoryId);
    setPending(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-0.5">
      <EditCategoryDialog categoryId={categoryId} name={name} initialValues={initialValues} availableMenus={availableMenus} />
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`} />}>
          <Trash2 className="size-4" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Items and menus using this category aren&apos;t deleted — they just lose this tag/assignment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={handleDelete}>
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
