"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, CreditCard, FileText, KeyRound, Link2, Percent, Phone, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { InfoBox, PanelHeader, SettingsPanel } from "../../../../_components/settings-ui";
import type { PaymentSettingsView } from "@/modules/payments/payment-settings";
import { disconnectRazorpayAction, saveAdvanceAction, saveGstAction, saveRazorpayAction, saveUpiAction, setAutoInvoiceAction, setMethodEnabledAction, testRazorpayAction, type ActionResult } from "../actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

/** "Offer to customers": switches one method on or off. Both on means customers see both. */
function MethodToggle({ method, label, enabled, configured }: { method: "razorpay" | "upi"; label: string; enabled: boolean; configured: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function change(next: boolean) {
    setError(null);
    setPending(true);
    const result = await setMethodEnabledAction(method, next);
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-muted/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Offer {label} to customers</p>
          <p className="text-xs text-muted-foreground">{!configured ? `Save your ${label} details first.` : enabled ? `Customers can pay with ${label}.` : `Hidden from customers.`}</p>
        </div>
        <Switch checked={enabled} disabled={!configured || pending} onCheckedChange={change} aria-label={`Offer ${label} to customers`} />
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function PaymentsSettings({ settings, webhookUrl }: { settings: PaymentSettingsView; webhookUrl: string }) {
  const offered = [settings.razorpay.enabled && "Razorpay", settings.upi?.enabled && "UPI QR"].filter(Boolean).join(" and ");
  return (
    <div className="flex flex-col gap-4">
      <InfoBox tone={offered ? "success" : "neutral"} title="What customers can pay with">
        <p data-testid="offered-methods">
          {offered ? `Customers see: ${offered}.${settings.razorpay.enabled && settings.upi?.enabled ? " Both are offered side by side." : ""}` : "Nothing yet. Set up Razorpay or UPI and switch it on to let customers pay online."}
        </p>
      </InfoBox>
      <RazorpayPanel settings={settings} webhookUrl={webhookUrl} />
      <UpiPanel settings={settings} />
      <AdvancePanel settings={settings} />
      <GstPanel settings={settings} />
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
      <MethodToggle method="razorpay" label="Razorpay" enabled={settings.razorpay.enabled} configured={connected} />
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
      <MethodToggle method="upi" label="UPI QR" enabled={settings.upi?.enabled ?? false} configured={settings.upi !== null} />
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

/** GST and invoices (AJ, 2026-10-10): the number and switch moved here from Business Profile, plus the default rate and type for new invoices. */
function GstPanel({ settings }: { settings: PaymentSettingsView }) {
  const router = useRouter();
  const { pending, message, run } = useSave();
  const [number, setNumber] = useState(settings.gst.number);
  const [show, setShow] = useState(settings.gst.showOnInvoices);
  const [rate, setRate] = useState(String(settings.gst.rate));
  const [type, setType] = useState<string>(settings.gst.type);
  const [auto, setAuto] = useState(settings.autoInvoice);
  const [autoError, setAutoError] = useState<string | null>(null);

  async function changeAuto(next: boolean) {
    setAutoError(null);
    setAuto(next);
    const result = await setAutoInvoiceAction(next);
    if (!result.ok) {
      setAuto(!next);
      setAutoError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <SettingsPanel>
      <PanelHeader icon={FileText} title="GST & invoices" description="Your GST details, the default rate for new invoices, and when invoices are created." />
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData();
          formData.set("gstNumber", number);
          formData.set("gstShowOnInvoices", String(show));
          formData.set("gstRate", rate);
          formData.set("gstType", type);
          void run(() => saveGstAction(formData), "GST settings saved.");
        }}
      >
        <div className="flex max-w-sm flex-col gap-1.5">
          <Label htmlFor="gst-number">GST number (optional)</Label>
          <IconInput icon={FileText} id="gst-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="29ABCDE1234F1Z5" maxLength={15} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 p-3">
          <div>
            <Label htmlFor="gst-show" className="text-sm font-medium">Show GST details on invoices</Label>
            <p className="text-xs text-muted-foreground">Adds your GST number and the tax split to every new invoice. Prices already include GST.</p>
          </div>
          <Switch id="gst-show" checked={show} onCheckedChange={setShow} />
        </div>
        <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gst-rate">GST rate (%)</Label>
            <IconInput icon={Percent} id="gst-rate" type="number" min={0} max={28} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
            <p className="text-xs text-muted-foreground">Default for every new invoice. Default 5.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gst-type">GST type</Label>
            <Select items={{ CGST_SGST: "CGST + SGST", IGST: "IGST" }} value={type} onValueChange={(v) => setType(v ?? type)}>
              <SelectTrigger id="gst-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CGST_SGST">CGST + SGST</SelectItem>
                <SelectItem value="IGST">IGST</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">CGST + SGST within your state, IGST across states.</p>
          </div>
        </div>
        <div>
          <Button type="submit" size="md" disabled={pending}>
            {pending ? "Saving…" : "Save GST"}
          </Button>
        </div>
        <Status message={message} />
      </form>

      <div className="flex flex-col gap-1.5 border-t border-border pt-5">
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 p-3">
          <div>
            <Label htmlFor="auto-invoice" className="text-sm font-medium">Create the invoice automatically</Label>
            <p className="text-xs text-muted-foreground">When an order is sent to the kitchen, its invoice is created as a draft. You still press Send Invoice.</p>
          </div>
          <Switch id="auto-invoice" checked={auto} onCheckedChange={changeAuto} aria-label="Create the invoice automatically" />
        </div>
        {autoError && (
          <p role="alert" className="text-xs text-destructive">
            {autoError}
          </p>
        )}
      </div>
    </SettingsPanel>
  );
}
