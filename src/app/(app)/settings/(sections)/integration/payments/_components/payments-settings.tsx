"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, CreditCard, KeyRound, Link2, Percent, Phone, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { InfoBox, PanelHeader, SettingsPanel } from "../../../../_components/settings-ui";
import type { PaymentSettingsView } from "@/modules/payments/payment-settings";
import { disconnectRazorpayAction, saveAdvanceAction, saveRazorpayAction, saveUpiAction, testRazorpayAction, type ActionResult } from "../actions";

/** A save button + status line shared by the three panels. */
function useSave() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(task: () => Promise<ActionResult>, success: string) {
    setPending(true);
    setMessage(null);
    const result = await task();
    setPending(false);
    setMessage(result.ok ? { ok: true, text: result.message ?? success } : { ok: false, text: result.error });
    if (result.ok) router.refresh();
  }
  return { pending, message, run };
}

function Status({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}>
      {message.text}
    </p>
  );
}

export function PaymentsSettings({ settings, webhookUrl }: { settings: PaymentSettingsView; webhookUrl: string }) {
  return (
    <div className="flex flex-col gap-4">
      <RazorpayPanel settings={settings} webhookUrl={webhookUrl} />
      <UpiPanel settings={settings} />
      <AdvancePanel settings={settings} />
    </div>
  );
}

function RazorpayPanel({ settings, webhookUrl }: { settings: PaymentSettingsView; webhookUrl: string }) {
  const { pending, message, run } = useSave();
  const [copied, setCopied] = useState(false);
  const connected = settings.razorpay.connected;

  async function copy() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the URL is selectable text as well */
    }
  }

  return (
    <SettingsPanel>
      <PanelHeader icon={CreditCard} title="Razorpay" description="Use your own Razorpay account. Customers pay you directly; Platterly never holds your money." />
      {connected && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-success">
            <CheckCircle2 className="size-4.5" /> Connected
          </span>
          <span className="text-sm text-muted-foreground">Key ID {settings.razorpay.keyIdMasked}</span>
        </div>
      )}
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          void run(() => saveRazorpayAction(formData), "Razorpay saved.");
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rzp-key-id">Key ID</Label>
            <IconInput icon={Link2} id="rzp-key-id" name="keyId" placeholder={connected ? "Leave to keep the saved Key ID" : "rzp_live_…"} required={!connected} autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rzp-key-secret">Key Secret</Label>
            <IconInput icon={KeyRound} id="rzp-key-secret" name="keySecret" type="password" placeholder={connected ? "Saved. Type to replace." : "Key Secret"} required={!connected} autoComplete="off" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rzp-webhook-secret">Webhook Secret</Label>
          <IconInput icon={ShieldCheck} id="rzp-webhook-secret" name="webhookSecret" type="password" placeholder={connected ? "Saved. Type to replace." : "Webhook Secret"} required={!connected} autoComplete="off" />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 p-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Webhook URL to paste into Razorpay</p>
            <p className="mt-1 font-mono text-xs break-all">{webhookUrl}</p>
          </div>
          <Button type="button" variant="outline" size="md" className="w-[38px] shrink-0 px-0" onClick={copy} aria-label="Copy webhook URL">
            {copied ? <CheckCircle2 /> : <Copy />}
          </Button>
        </div>
        <InfoBox tone="info" title="Keys are stored encrypted">
          <p>The secret is never shown again after you save it. In Razorpay, turn on the payment.captured and payment.failed events for the webhook.</p>
        </InfoBox>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="md" disabled={pending}>
            {pending ? "Saving…" : "Save Razorpay"}
          </Button>
          {connected && (
            <>
              <Button type="button" variant="outline" size="md" disabled={pending} onClick={() => run(testRazorpayAction, "Razorpay accepted your keys.")}>
                Test Connection
              </Button>
              <Button type="button" variant="outline" size="md" className="text-destructive" disabled={pending} onClick={() => run(disconnectRazorpayAction, "Razorpay disconnected.")}>
                Disconnect
              </Button>
            </>
          )}
        </div>
        <Status message={message} />
      </form>
    </SettingsPanel>
  );
}

function UpiPanel({ settings }: { settings: PaymentSettingsView }) {
  const { pending, message, run } = useSave();
  return (
    <SettingsPanel>
      <PanelHeader icon={Phone} title="UPI" description="Every payment link and the approval page get a QR with the exact amount." />
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          void run(() => saveUpiAction(formData), "UPI saved.");
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="upi-id">UPI ID</Label>
            <IconInput icon={Phone} id="upi-id" name="upiId" key={settings.upi?.upiId ?? "none"} placeholder="name@bank" defaultValue={settings.upi?.upiId ?? ""} autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="upi-name">Name shown in the UPI app</Label>
            <IconInput icon={User} id="upi-name" name="payeeName" key={settings.upi?.payeeName ?? "none"} placeholder="Your business name" defaultValue={settings.upi?.payeeName ?? ""} />
          </div>
        </div>
        <InfoBox tone="warning" title="UPI payments need your confirmation">
          <p>Money goes straight to your account, so confirm each one on the invoice once it arrives. Razorpay payments confirm themselves. Clear both fields to turn UPI off.</p>
        </InfoBox>
        <div>
          <Button type="submit" size="md" disabled={pending}>
            {pending ? "Saving…" : "Save UPI"}
          </Button>
        </div>
        <Status message={message} />
      </form>
    </SettingsPanel>
  );
}

function AdvancePanel({ settings }: { settings: PaymentSettingsView }) {
  const { pending, message, run } = useSave();
  return (
    <SettingsPanel>
      <PanelHeader icon={Percent} title="Advance" description="How much a customer is asked to pay up front to secure the date." />
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          void run(() => saveAdvanceAction(formData), "Advance saved.");
        }}
      >
        <div className="flex max-w-xs flex-col gap-1.5">
          <Label htmlFor="advance-percent">Advance (% of the order)</Label>
          <IconInput icon={Percent} id="advance-percent" name="advancePercent" key={settings.advancePercent} type="number" min={1} max={100} step="1" required defaultValue={settings.advancePercent} />
          <p className="text-xs text-muted-foreground">Used by the Advance option on payment links and on the customer&apos;s approval page. Default 50.</p>
        </div>
        <div>
          <Button type="submit" size="md" disabled={pending}>
            {pending ? "Saving…" : "Save Advance"}
          </Button>
        </div>
        <Status message={message} />
      </form>
    </SettingsPanel>
  );
}
