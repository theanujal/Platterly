"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, Send, Trash2, Webhook } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { WEBHOOK_EVENTS } from "@/modules/webhooks/events";
import { InfoBox, PanelHeader, SettingsPanel } from "../../../../_components/settings-ui";
import { createWebhookAction, deleteWebhookAction, retryDeliveryAction, rotateWebhookSecretAction, testWebhookAction, updateWebhookAction } from "../actions";

interface EndpointRow {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  isActive: boolean;
  disabledReason: string | null;
}
interface DeliveryRow {
  id: string;
  eventName: string;
  status: "PENDING" | "DELIVERED" | "FAILED";
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
  endpointUrl: string;
}

const STATUS: Record<DeliveryRow["status"], { label: string; variant: "success" | "danger" | "warning" }> = {
  DELIVERED: { label: "Delivered", variant: "success" },
  FAILED: { label: "Failed", variant: "danger" },
  PENDING: { label: "Retrying", variant: "warning" },
};
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Chunk 25 — where Platterly posts its events, with a log of every delivery. */
export function WebhooksPanel({ endpoints, deliveries, canEdit }: { endpoints: EndpointRow[]; deliveries: DeliveryRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<string[]>(WEBHOOK_EVENTS.map((e) => e.id));
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: true; secret?: string; message?: string } | { ok: false; error: string }>) {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setError(result.error);
      if (result.secret) setSecret(result.secret);
      if (result.message) setNote(result.message);
      router.refresh();
    });
  }

  function add(event: React.FormEvent) {
    event.preventDefault();
    run(async () => {
      const result = await createWebhookAction(url, description, events);
      if (result.ok) {
        setUrl("");
        setDescription("");
      }
      return result;
    });
  }

  return (
    <SettingsPanel>
      <PanelHeader icon={Webhook} title="Webhooks" description="Platterly posts a small, signed message to your web address whenever something happens, such as a new order or a payment." />
      {secret && (
        <InfoBox tone="success" title="Your signing secret">
          <p>Your server uses this to check that a message really came from Platterly. It is shown only this once.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-background px-3 py-2 font-mono text-sm break-all" data-testid="new-webhook-secret">{secret}</code>
            <CopyButton value={secret} size="md" label="Copy secret" />
            <Button type="button" variant="outline" size="md" onClick={() => setSecret(null)}>
              I have saved it
            </Button>
          </div>
        </InfoBox>
      )}

      <ul className="flex flex-col gap-3">
        {endpoints.length === 0 && <li className="text-sm text-muted-foreground">No webhooks yet.</li>}
        {endpoints.map((endpoint) => (
          <li key={endpoint.id} className="flex flex-col gap-3 rounded-lg border border-border p-4" data-testid="webhook-row">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold break-all">
                  {endpoint.url}
                  <Badge variant={endpoint.isActive ? "success" : "neutral"}>{endpoint.isActive ? "On" : "Off"}</Badge>
                </p>
                {endpoint.description && <p className="text-sm text-muted-foreground">{endpoint.description}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{endpoint.events.length} of {WEBHOOK_EVENTS.length} events: {endpoint.events.join(", ")}</p>
                {endpoint.disabledReason && <p className="mt-1 text-sm text-warning">{endpoint.disabledReason}</p>}
              </div>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={endpoint.isActive} disabled={pending} onCheckedChange={(on) => run(() => updateWebhookAction(endpoint.id, { isActive: on === true }))} aria-label={`Turn ${endpoint.url} on or off`} />
                  </label>
                  <Button type="button" variant="outline" size="md" disabled={pending} onClick={() => run(() => testWebhookAction(endpoint.id))}>
                    <Send /> Send test
                  </Button>
                  <Button type="button" variant="outline" size="md" disabled={pending} onClick={() => run(() => rotateWebhookSecretAction(endpoint.id))}>
                    <RotateCw /> New secret
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="outline" size="md" className="text-destructive" aria-label={`Delete ${endpoint.url}`} />}>
                      <Trash2 />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this webhook?</AlertDialogTitle>
                        <AlertDialogDescription>Platterly stops sending to {endpoint.url} and its delivery log is removed.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => run(() => deleteWebhookAction(endpoint.id))}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {note && <p className="text-sm text-muted-foreground" role="status">{note}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {canEdit && (
        <form onSubmit={add} className="flex flex-col gap-4 border-t border-border pt-5">
          <h3 className="text-sm font-semibold">Add a webhook</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="webhook-url">Web address</Label>
              <Input id="webhook-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/platterly" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="webhook-description">Note (optional)</Label>
              <Input id="webhook-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
            </div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Events to send</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {WEBHOOK_EVENTS.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-start gap-3 text-sm">
                  <Checkbox checked={events.includes(e.id)} onCheckedChange={(checked) => setEvents((prev) => (checked === true ? [...prev, e.id] : prev.filter((x) => x !== e.id)))} className="mt-0.5" />
                  <span>
                    <code className="font-mono text-xs">{e.id}</code>
                    <span className="block text-xs text-muted-foreground">{e.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Button type="submit" size="md" disabled={pending || url.trim() === "" || events.length === 0}>
              Add Webhook
            </Button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-3 border-t border-border pt-5">
        <h3 className="text-sm font-semibold">Recent deliveries</h3>
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has been sent yet.</p>
        ) : (
          <div className="overflow-x-auto" data-testid="webhook-deliveries">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-left text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  <th className="py-2 pr-4 font-bold">When</th>
                  <th className="py-2 pr-4 font-bold">Event</th>
                  <th className="py-2 pr-4 font-bold">Status</th>
                  <th className="py-2 pr-4 font-bold">Tries</th>
                  <th className="py-2 font-bold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-t border-border align-top">
                    <td className="py-2 pr-4 whitespace-nowrap">{when(d.createdAt)}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{d.eventName}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={STATUS[d.status].variant}>{STATUS[d.status].label}</Badge>
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{d.attempts}</td>
                    <td className="py-2 text-muted-foreground">
                      {d.lastError ?? (d.lastStatusCode ? `Answered ${d.lastStatusCode}` : "")}
                      {canEdit && d.status === "FAILED" && (
                        <Button type="button" variant="outline" size="sm" className="ml-2" disabled={pending} onClick={() => run(() => retryDeliveryAction(d.id))}>
                          Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SettingsPanel>
  );
}
