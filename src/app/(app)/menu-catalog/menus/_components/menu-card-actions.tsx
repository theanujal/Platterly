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
import { EditMenuDialog } from "./edit-menu-dialog";
import type { MenuFormValues, AssignedCategory } from "./menu-form";
import { deleteMenuAction } from "../actions";

interface MenuCardActionsProps {
  menuId: string;
  name: string;
  initialValues: MenuFormValues;
  assignedCategories: AssignedCategory[];
}

export function MenuCardActions({ menuId, name, initialValues, assignedCategories }: MenuCardActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    await deleteMenuAction(menuId);
    setPending(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-0.5">
      <EditMenuDialog menuId={menuId} name={name} initialValues={initialValues} assignedCategories={assignedCategories} />
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`} />}>
          <Trash2 className="size-4" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>The menu items themselves aren&apos;t deleted, only this grouping.</AlertDialogDescription>
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
