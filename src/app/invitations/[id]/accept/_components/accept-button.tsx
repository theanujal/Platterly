"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "../actions";

/**
 * AJ, 2026-10-01: an invited teammate has no steps between verifying their
 * email and the Dashboard, so the invitation is accepted as soon as this
 * mounts. The button is only the retry path if that attempt fails.
 */
export function AcceptButton({ invitationId }: { invitationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const started = useRef(false);

  async function handleAccept() {
    setError(null);
    setPending(true);
    const result = await acceptInvitationAction(invitationId);
    // A successful accept redirects server-side and never returns here.
    setPending(false);
    if (!result.ok) {
      setError(result.error);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void handleAccept();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {(error || !pending) && (
        <Button onClick={handleAccept} disabled={pending} className="text-base font-semibold">
          Try again
        </Button>
      )}
      {pending && <p className="text-sm text-muted-foreground">Joining…</p>}
    </div>
  );
}
