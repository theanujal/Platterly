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
import { suspendTenantAction, activateTenantAction, deactivateTenantAction } from "../../actions";
import type { TenantStatus } from "@/generated/prisma/enums";

interface StatusActionsProps {
  tenantId: string;
  status: TenantStatus;
}

const CONFIRMATIONS: Record<
  "suspend" | "activate" | "deactivate",
  { label: string; title: string; description: string; variant: "default" | "destructive" }
> = {
  suspend: {
    label: "Suspend",
    title: "Suspend this caterer?",
    description: "The caterer's team will lose access until reactivated.",
    variant: "destructive",
  },
  activate: {
    label: "Activate",
    title: "Activate this caterer?",
    description: "Restores the caterer's access.",
    variant: "default",
  },
  deactivate: {
    label: "Deactivate",
    title: "Deactivate this caterer?",
    description: "This is a soft deactivation — records and history are kept, and it can be reversed by activating again.",
    variant: "destructive",
  },
};

function ConfirmAction({
  tenantId,
  kind,
  action,
}: {
  tenantId: string;
  kind: keyof typeof CONFIRMATIONS;
  action: (id: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const copy = CONFIRMATIONS[kind];

  async function handleConfirm() {
    setPending(true);
    await action(tenantId);
    setPending(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>{copy.label}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={copy.variant} disabled={pending} onClick={handleConfirm}>
            {pending ? "Working…" : copy.label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function StatusActions({ tenantId, status }: StatusActionsProps) {
  return (
    <div className="flex gap-2">
      {status !== "ACTIVE" && <ConfirmAction tenantId={tenantId} kind="activate" action={activateTenantAction} />}
      {status !== "SUSPENDED" && <ConfirmAction tenantId={tenantId} kind="suspend" action={suspendTenantAction} />}
      {status !== "DEACTIVATED" && (
        <ConfirmAction tenantId={tenantId} kind="deactivate" action={deactivateTenantAction} />
      )}
    </div>
  );
}
