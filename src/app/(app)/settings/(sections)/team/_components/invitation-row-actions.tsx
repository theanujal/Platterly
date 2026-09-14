"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { cancelInvitationAction, resendInvitationAction } from "../actions";

interface InvitationRowActionsProps {
  invitationId: string;
  email: string;
  role: string;
}

export function InvitationRowActions({ invitationId, email, role }: InvitationRowActionsProps) {
  const router = useRouter();
  const [pendingResend, setPendingResend] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pendingCancel, setPendingCancel] = useState(false);

  async function handleResend() {
    setPendingResend(true);
    await resendInvitationAction(email, role);
    setPendingResend(false);
    router.refresh();
  }

  async function handleCancel() {
    setPendingCancel(true);
    await cancelInvitationAction(invitationId);
    setPendingCancel(false);
    setCancelOpen(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" disabled={pendingResend} onClick={handleResend}>
        {pendingResend ? "Resending…" : "Resend"}
      </Button>
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>Cancel</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this invitation?</AlertDialogTitle>
            <AlertDialogDescription>{email} will no longer be able to use this invitation link.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pendingCancel} onClick={handleCancel}>
              {pendingCancel ? "Cancelling…" : "Cancel invitation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
