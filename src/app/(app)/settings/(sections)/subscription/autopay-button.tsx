"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setAutoPayPausedAction } from "@/app/subscribe/actions";

/** "Pause subscription" / "Resume" for monthly auto-pay. Pausing stops future charges only; the paid days run out as usual. */
export function AutoPayButton({ paused }: { paused: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setBusy(true);
    setError(null);
    const result = await setAutoPayPausedAction(!paused);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }
  return (
    <div className="flex flex-col gap-1">
      <Button size="md" variant="outline" className="self-start" disabled={busy} onClick={toggle} data-testid="autopay-toggle">
        {busy ? "Please wait…" : paused ? "Resume" : "Pause subscription"}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
