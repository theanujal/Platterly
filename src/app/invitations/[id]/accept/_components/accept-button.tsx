"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "../actions";

export function AcceptButton({ invitationId }: { invitationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button onClick={handleAccept} disabled={pending} className="h-11 rounded-full text-base font-semibold">
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
    </div>
  );
}
