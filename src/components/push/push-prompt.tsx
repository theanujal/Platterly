"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bell, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { answerPushPromptAction } from "@/app/push-actions";
import { enablePush, pushSupported, thisDeviceHasPush } from "./push-client";

/**
 * The "Stay updated with Platterly" popup (AJ's reference, in Platterly's branding). Shown right after sign-up and
 * again every 3 days after "Maybe Later" (the schedule lives on the server, see modules/notifications/push-prompt.ts).
 * It waits for any other dialog (e.g. "Claim your custom link") to close first, and never shows where the browser
 * can't do push or has already blocked it.
 */
export function PushPrompt({ show, vapidPublicKey, benefits, settingsHref }: { show: boolean; vapidPublicKey: string | null; benefits: string[]; settingsHref: string | null }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!show || !vapidPublicKey || !pushSupported() || Notification.permission === "denied") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tryOpen() {
      if (cancelled) return;
      // Someone is mid-way through another dialog: ask again shortly.
      if (document.querySelector('[data-slot="dialog-overlay"]')) {
        timer = setTimeout(tryOpen, 2000);
        return;
      }
      if (await thisDeviceHasPush()) return;
      if (!cancelled) setOpen(true);
    }
    timer = setTimeout(tryOpen, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [show, vapidPublicKey]);

  function answer(kind: "later" | "never") {
    setOpen(false);
    startTransition(() => answerPushPromptAction(kind));
  }

  function enable() {
    setError(null);
    startTransition(async () => {
      const result = await enablePush(vapidPublicKey!);
      if (result === "enabled") return setOpen(false);
      if (result === "denied") {
        setError("Notifications are blocked in your browser. Allow them for this site in the address bar, then try again.");
        await answerPushPromptAction("later");
        return;
      }
      setError("We couldn't turn notifications on in this browser.");
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && answer("later")}>
      <DialogContent className="gap-5 p-6 sm:max-w-md" data-testid="push-prompt">
        <div className="flex items-center gap-3 pr-8">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bell className="size-6" aria-hidden />
          </span>
          <div>
            <DialogTitle className="text-lg font-semibold">Stay updated with Platterly</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">Get alerts on this device, even when Platterly is closed.</DialogDescription>
          </div>
        </div>

        <ul className="flex flex-col gap-2 rounded-xl border border-border p-3">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-center gap-2.5 text-sm">
              <Check className="size-4 shrink-0 text-success" aria-hidden />
              {benefit}
            </li>
          ))}
        </ul>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2.5">
          <Button type="button" size="md" className="w-full" disabled={pending} onClick={enable}>
            <Bell className="size-4" aria-hidden /> Enable Notifications
          </Button>
          <div className="grid grid-cols-2 gap-2.5">
            <Button type="button" variant="outline" size="md" disabled={pending} onClick={() => answer("later")}>
              Maybe Later
            </Button>
            <Button type="button" variant="ghost" size="md" className="text-muted-foreground" disabled={pending} onClick={() => answer("never")}>
              <X className="size-4" aria-hidden /> Don&apos;t Ask Again
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {settingsHref ? (
              <>
                You can change this anytime in your{" "}
                <Link href={settingsHref} className="font-medium text-primary hover:underline" onClick={() => setOpen(false)}>
                  notification settings
                </Link>
                .
              </>
            ) : (
              "You can change this anytime."
            )}
          </span>
          <Image src="/platterly-logo.svg" alt="Platterly" width={70} height={16} className="h-4 w-auto shrink-0" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
