"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { sendQuotationAction, markQuotationExpiredAction, convertQuotationToOrderAction, deleteQuotationAction } from "../../actions";
import type { QuotationStatus } from "@/generated/prisma/enums";

const SENDABLE: QuotationStatus[] = ["DRAFT", "CHANGES_REQUESTED"];
const EXPIRABLE: QuotationStatus[] = ["DRAFT", "SENT", "VIEWED", "CHANGES_REQUESTED"];

interface QuotationStatusActionsProps {
  quotationId: string;
  status: QuotationStatus;
  hasOrder: boolean;
}

export function QuotationStatusActions({ quotationId, status, hasOrder }: QuotationStatusActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function run(name: string, action: () => Promise<{ ok: boolean; error?: string; orderId?: string }>) {
    setPending(name);
    setError(null);
    const result = await action();
    setPending(null);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    if (result.orderId) {
      router.push(`/orders/${result.orderId}`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {SENDABLE.includes(status) && (
          <Button size="sm" disabled={pending !== null} onClick={() => run("send", () => sendQuotationAction(quotationId))}>
            {pending === "send" ? "Sending…" : "Send Quotation"}
          </Button>
        )}
        {status === "ACCEPTED" && !hasOrder && (
          <Button size="sm" disabled={pending !== null} onClick={() => run("convert", () => convertQuotationToOrderAction(quotationId))}>
            {pending === "convert" ? "Converting…" : "Convert to Order"}
          </Button>
        )}
        {status === "ACCEPTED" && hasOrder && (
          <Button size="sm" variant="outline" render={<Link href="/orders" />} nativeButton={false}>
            View Order
          </Button>
        )}
        {EXPIRABLE.includes(status) && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() => run("expire", () => markQuotationExpiredAction(quotationId))}
          >
            {pending === "expire" ? "Marking…" : "Mark Expired"}
          </Button>
        )}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>Delete</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this Quotation?</AlertDialogTitle>
              <AlertDialogDescription>Its line items will be permanently removed. Any Order already converted from it is unaffected.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending !== null}
                onClick={() => run("delete", async () => {
                  const result = await deleteQuotationAction(quotationId);
                  if (result.ok) router.push("/quotations");
                  return result;
                })}
              >
                {pending === "delete" ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
