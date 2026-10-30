"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cancelAutoPayAction, setAutoPayPausedAction } from "@/app/subscribe/actions";

/**
 * "Cancel subscription" for monthly auto-pay. Before cancelling, the kitchen is offered Pause instead (AJ, 2026-10-30): a pause can be
 * resumed, a cancel cannot. Cancelling stops charges now; the paid days run out as usual, then the 7-day grace and the lock.
 */
export function CancelSubscriptionButton({ paused, paidUntil }: { paused: boolean; paidUntil: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"pause" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "pause" | "cancel") {
    setBusy(kind);
    setError(null);
    const result = kind === "pause" ? await setAutoPayPausedAction(true) : await cancelAutoPayAction();
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <Button size="md" variant="outline" className="self-start text-destructive" onClick={() => { setError(null); setOpen(true); }} data-testid="cancel-subscription">
        Cancel subscription
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <AlertDialogContent data-testid="cancel-subscription-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Why cancel?</AlertDialogTitle>
            <AlertDialogDescription>
              {paused
                ? "Your subscription is already paused, so you are not being charged. We will wait for you to come back, and you can resume it whenever you are ready."
                : "You can pause it instead, and we will wait for you to come back. Pausing stops the next charges and keeps everything just as you left it."}
              {" "}
              Cancelling stops all future charges for good{paidUntil ? `. Your plan keeps working until ${paidUntil}` : ""}, and after that you would need to set up auto-pay again to carry on. Nothing you built is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Keep my subscription</AlertDialogCancel>
            {!paused && (
              <AlertDialogAction disabled={!!busy} onClick={(event) => { event.preventDefault(); void run("pause"); }} data-testid="cancel-dialog-pause">
                {busy === "pause" ? "Working…" : "Pause instead"}
              </AlertDialogAction>
            )}
            <AlertDialogAction variant="destructive" disabled={!!busy} onClick={(event) => { event.preventDefault(); void run("cancel"); }} data-testid="cancel-dialog-confirm">
              {busy === "cancel" ? "Working…" : "Cancel subscription"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
