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
import { EditItemDialog } from "./edit-item-dialog";
import type { ItemFormValues } from "./item-form";
import { deleteMenuItemAction } from "../actions";

interface ItemCardActionsProps {
  itemId: string;
  name: string;
  initialValues: ItemFormValues;
  categories: { id: string; name: string }[];
  menus: { id: string; name: string }[];
}

export function ItemCardActions({ itemId, name, initialValues, categories, menus }: ItemCardActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    await deleteMenuItemAction(itemId);
    setPending(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-0.5">
      <EditItemDialog itemId={itemId} name={name} initialValues={initialValues} categories={categories} menus={menus} />
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`} />}>
          <Trash2 className="size-4" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>The menus/categories referencing it aren&apos;t deleted, only this item.</AlertDialogDescription>
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
