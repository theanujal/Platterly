"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setPromotionalOptOutAction } from "./actions";

export function OptOutButton({ token, optedOut }: { token: string; optedOut: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change() {
    setError(null);
    startTransition(async () => {
      const result = await setPromotionalOptOutAction(token, !optedOut);
      if (!result.ok) return setError("That did not work. Please try again.");
      router.refresh();
    });
  }

  return (
    <>
      <Button size="md" variant={optedOut ? "outline" : "default"} disabled={pending} onClick={change}>
        {pending ? "Saving…" : optedOut ? "Subscribe again" : "Unsubscribe"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
