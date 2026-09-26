"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLinkItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteOrderAction } from "../actions";

interface OrderCardMenuProps {
  orderId: string;
  orderLabel: string;
  customerName: string;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * The 3-dot actions menu on an Orders card. Sits outside the card's
 * stretched link (see order-card.tsx), so opening it never navigates.
 * Delete's confirmation dialog is rendered beside the menu, not inside it —
 * a dialog owned by a menu item unmounts the moment the menu closes.
 */
export function OrderCardMenu({ orderId, orderLabel, customerName, canEdit, canDelete }: OrderCardMenuProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit && !canDelete) return null;

  async function handleDelete() {
    setPending(true);
    setError(null);
    const result = await deleteOrderAction(orderId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConfirmOpen(false);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" className="bg-muted text-muted-foreground hover:bg-muted/70" aria-label={`Actions for ${orderLabel}`} />}
        >
          <MoreVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {canEdit && (
            <DropdownMenuLinkItem render={<Link href={`/orders/${orderId}`} />}>
              <Pencil />
              View / Edit Order
            </DropdownMenuLinkItem>
          )}
          {canDelete && (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                setError(null);
                setConfirmOpen(true);
              }}
            >
              <Trash2 />
              Delete Order
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this order for &quot;{customerName}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>Its items and meal plan will be permanently removed. A linked Event is unlinked, not deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={handleDelete}>
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
