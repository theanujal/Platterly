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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { purgeTenantDataAction } from "../actions";

const REQUIRED_PHRASE = "DELETE";

// Chunk 5 Group 5.4 — first typed-confirmation UI in this codebase (no
// prior pattern to copy). The destructive action stays disabled until the
// input exactly matches the required phrase.
export function PurgeConfirmationDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const matches = typed === REQUIRED_PHRASE;

  async function handleConfirm() {
    setError(null);
    setPending(true);
    const result = await purgeTenantDataAction(typed);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.push("/dashboard");
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTyped("");
          setError(null);
        }
      }}
    >
      <AlertDialogTrigger render={<Button variant="destructive" />}>Delete All Data</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete all tenant data?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes your branches, kitchens, stores, notifications, and other operational data.
            Your account, team, and subscription are kept. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="purge-confirm">
            Type <span className="font-mono font-semibold">{REQUIRED_PHRASE}</span> to confirm
          </Label>
          <Input id="purge-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={!matches || pending} onClick={handleConfirm}>
            {pending ? "Deleting…" : "Delete All Data"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
