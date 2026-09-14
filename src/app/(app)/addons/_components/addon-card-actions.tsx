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
import { EditAddOnDialog } from "./edit-addon-dialog";
import type { AddOnFormValues } from "./addon-form";
import { deleteAddOnAction } from "../actions";

interface AddOnCardActionsProps {
  addOnId: string;
  name: string;
  initialValues: AddOnFormValues;
}

export function AddOnCardActions({ addOnId, name, initialValues }: AddOnCardActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    await deleteAddOnAction(addOnId);
    setPending(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-0.5">
      <EditAddOnDialog addOnId={addOnId} name={name} initialValues={initialValues} />
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`} />}>
          <Trash2 className="size-4" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>This add-on will be permanently removed.</AlertDialogDescription>
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
