"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updatePushToggleAction } from "../../actions";

export function PushToggleForm({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSuccess(false);
    setPending(true);
    const formData = new FormData();
    formData.set("enabled", String(enabled));
    await updatePushToggleAction(formData);
    setPending(false);
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          id="push-enabled"
          type="checkbox"
          className="size-4"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <Label htmlFor="push-enabled">Send push notifications</Label>
      </div>
      <p className="max-w-md text-xs text-muted-foreground">
        No push provider is connected yet — this saves your preference for when one is (a later chunk).
      </p>
      {success && <p className="text-sm text-emerald-600">Saved.</p>}
      <Button type="submit" disabled={pending} size="sm" className="self-start">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
