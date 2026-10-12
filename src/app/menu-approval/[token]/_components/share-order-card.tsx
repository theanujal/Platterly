"use client";

import { useState } from "react";
import { Share2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { FormCard } from "@/components/public/form-section";
import { setOrderSharingAction } from "../actions";

/**
 * "Share with family & team" (AJ, 2026-10-12) on the customer's Confirmation page: a read-only page with the event, the
 * menu and the kitchen's contact. No prices and no phone numbers. The customer can switch it off any time.
 */
export function ShareOrderCard({ token, initial }: { token: string; initial: { url: string | null; qr: string | null } }) {
  const [share, setShare] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(on: boolean) {
    setPending(true);
    setError(null);
    const result = await setOrderSharingAction(token, on);
    setPending(false);
    if (!result.ok) return setError(result.error);
    setShare({ url: result.url, qr: result.qr });
  }

  return (
    <FormCard className="gap-4 md:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Share2 className="size-5" />
        </span>
        <h2 className="text-[15px] font-semibold">Share with family &amp; team</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Give your family and team one page with the event details, the menu and our contact. It shows no prices and no phone numbers, and nobody needs to sign in.
      </p>

      {share.url ? (
        <div className="flex flex-col gap-3" data-testid="share-on">
          {share.qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- a generated data URL
            <img src={share.qr} alt="QR code for the shared page" className="mx-auto size-40 rounded-lg" />
          ) : (
            <QrCode className="mx-auto size-10 text-muted-foreground" />
          )}
          <p className="w-full min-w-0 truncate rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground" data-testid="share-url">
            {share.url}
          </p>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={share.url} label="Copy link" size="md" />
            <Button
              variant="outline"
              size="md"
              render={<a href={`https://wa.me/?text=${encodeURIComponent(`Here are the details for our event, with the menu: ${share.url}`)}`} target="_blank" rel="noopener" />}
              nativeButton={false}
            >
              <WhatsAppIcon className="size-4 text-emerald-600" />
              Share on WhatsApp
            </Button>
          </div>
          <Button type="button" variant="link" size="md" className="self-start px-0 text-destructive" disabled={pending} onClick={() => change(false)}>
            {pending ? "Turning off…" : "Turn off sharing"}
          </Button>
          <p className="text-xs text-muted-foreground">The link works until the end of your event day. Turning it off stops it for everyone.</p>
        </div>
      ) : (
        <Button type="button" variant="outline" size="md" className="self-start" disabled={pending} onClick={() => change(true)}>
          <Share2 className="size-4" />
          {pending ? "Creating link…" : "Create share link"}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </FormCard>
  );
}
