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
import { EditInventoryDialog } from "./edit-inventory-dialog";
import { StockTransactionDialog } from "./stock-transaction-dialog";
import type { InventoryFormValues } from "./inventory-form";
import { deleteInventoryItemAction } from "../actions";

interface InventoryCardActionsProps {
  itemId: string;
  name: string;
  unit: string;
  currentStock: number;
  initialValues: InventoryFormValues;
}

export function InventoryCardActions({ itemId, name, unit, currentStock, initialValues }: InventoryCardActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    await deleteInventoryItemAction(itemId);
    setPending(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-0.5">
      <StockTransactionDialog itemId={itemId} name={name} unit={unit} currentStock={currentStock} />
      <EditInventoryDialog itemId={itemId} name={name} initialValues={initialValues} />
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`} />}>
          <Trash2 className="size-4" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>This inventory item and its stock history will be permanently removed.</AlertDialogDescription>
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
