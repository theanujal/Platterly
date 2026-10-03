"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setProviderConnectedAction } from "../../actions";

const CHANNELS = [
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "email", label: "Email", icon: Mail },
] as const;

/** Connect or disconnect the caterer's message providers. The caterer can only switch a channel on once it is connected here. */
export function ProviderConnect({ organizationId, connected }: { organizationId: string; connected: { whatsapp: boolean; email: boolean } }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(channel: "whatsapp" | "email", next: boolean) {
    setError(null);
    setBusy(channel);
    const result = await setProviderConnectedAction(organizationId, channel, next);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2.5">
      {CHANNELS.map(({ key, label, icon: Icon }) => (
        <div key={key} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm" data-testid={`provider-${key}`}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{label}</span>
            <span className="block text-xs text-muted-foreground">{connected[key] ? "The caterer can switch it on in their Settings." : "The caterer cannot switch it on yet."}</span>
          </span>
          <Badge variant={connected[key] ? "success" : "neutral"}>{connected[key] ? "Connected" : "Not connected"}</Badge>
          <Button type="button" variant="outline" size="md" disabled={busy !== null} onClick={() => toggle(key, !connected[key])}>
            {busy === key ? "Saving…" : connected[key] ? "Disconnect" : "Connect"}
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
