"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, UserPlus } from "lucide-react";
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
import { EditEnquiryDialog } from "./edit-enquiry-dialog";
import type { EnquiryFormValues } from "./enquiry-form";
import { deleteEnquiryAction, convertEnquiryAction } from "../actions";

interface EnquiryRowActionsProps {
  enquiryId: string;
  name: string;
  initialValues: EnquiryFormValues;
  eventTypes: { id: string; name: string }[];
  menus: { id: string; name: string }[];
  customerId: string | null;
}

export function EnquiryRowActions({ enquiryId, name, initialValues, eventTypes, menus, customerId }: EnquiryRowActionsProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [convertPending, setConvertPending] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  async function handleDelete() {
    setDeletePending(true);
    await deleteEnquiryAction(enquiryId);
    setDeletePending(false);
    setDeleteOpen(false);
    router.refresh();
  }

  async function handleConvert() {
    setConvertPending(true);
    setConvertError(null);
    const result = await convertEnquiryAction(enquiryId);
    setConvertPending(false);
    if (!result.ok) {
      setConvertError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-0.5">
      {customerId ? (
        <Button variant="ghost" size="icon-sm" aria-label={`View customer for ${name}`} render={<Link href={`/customers/${customerId}`} />} nativeButton={false}>
          <UserPlus className="size-4" />
        </Button>
      ) : (
        <Button variant="ghost" size="icon-sm" aria-label={`Convert ${name} to Customer`} disabled={convertPending} onClick={handleConvert} title={convertError ?? undefined}>
          <UserPlus className="size-4" />
        </Button>
      )}
      <EditEnquiryDialog enquiryId={enquiryId} name={name} initialValues={initialValues} eventTypes={eventTypes} menus={menus} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`} />}>
          <Trash2 className="size-4" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>This enquiry will be permanently removed. Any linked Customer is unaffected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deletePending} onClick={handleDelete}>
              {deletePending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
