"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarDays, CheckCheck, CheckCircle2, CircleAlert, ChefHat, ClipboardCheck, CreditCard, FileText, Info, Link2, Mail, MessageCircle, MessageSquare, PowerOff, Receipt, ShoppingCart, Truck, UtensilsCrossed } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CHANNEL_CONFIG,
  type ChannelSettings,
  type MessageKey,
  type SettingsChannel,
} from "@/modules/notifications/channel-settings-config";
import { saveChannelMessagesAction, setChannelActiveAction } from "../(sections)/communication/actions";
import { FormFooter, PanelHeader, SettingsPanel } from "./settings-ui";
import { cn } from "cn";
import { toast } from "@/components/ui/toaster";

const MESSAGE_ICON: Record<MessageKey, LucideIcon> = {
  orderConfirmation: MessageSquare,
  orderStatusUpdates: Info,
  eventReminders: CalendarDays,
  systemAlerts: Bell,
  orderReceived: MessageSquare,
  orderAccepted: CheckCircle2,
  orderConfirmed: CheckCircle2,
  orderUpdate: Info,
  orderCompleted: CheckCheck,
  quotation: FileText,
  menuReview: UtensilsCrossed,
  foodDispatched: Truck,
  invoice: Receipt,
  receipt: ClipboardCheck,
  paymentLink: Link2,
  paymentReminder: CreditCard,
  eventReminder: CalendarDays,
  waNewOrder: ShoppingCart,
  waSentToKitchen: ChefHat,
  waMenuSent: UtensilsCrossed,
  waMenuApproved: CheckCircle2,
  waPaymentReceived: CreditCard,
  waEventsTomorrow: CalendarDays,
  waOverdueDigest: Receipt,
};

const CHANNEL_ICON: Record<SettingsChannel, LucideIcon> = { whatsapp: MessageCircle, email: Mail, push: Bell };

/**
 * The service card (AJ's reference, 2026-09-30). The provider is connected by
 * the Platterly team from the admin dashboard, so the caterer only sees its
 * status and can activate or deactivate it once it is connected.
 */
export function ChannelServiceStatus({ channel, providerConnected, active }: { channel: SettingsChannel; providerConnected: boolean; active: boolean }) {
  const router = useRouter();
  const label = CHANNEL_CONFIG[channel].label;
  const [checked, setChecked] = useState(active);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setError(null);
    setChecked(next);
    startTransition(async () => {
      const result = await setChannelActiveAction(channel, next);
      if (!result.ok) {
        setChecked(!next);
        setError(result.error);
        return;
      }
      toast.success(next ? `${label} messages are switched on.` : `${label} messages are switched off.`);
      router.refresh();
    });
  }

  const Icon = CHANNEL_ICON[channel];
  const status = !providerConnected
    ? { icon: CircleAlert, tone: "text-muted-foreground", text: `${label} Service Not Connected` }
    : active
      ? { icon: CheckCircle2, tone: "text-success", text: `${label} Service Active` }
      : { icon: PowerOff, tone: "text-warning", text: `${label} Service Deactivated` };

  return (
    <SettingsPanel>
      <PanelHeader icon={Icon} title={`${label} Service Status`} description={`Current status of your ${label} service configuration`} />
      <div className="flex items-center justify-between gap-4">
        <p className={cn("flex items-center gap-2 text-sm font-semibold", status.tone)}>
          <status.icon className="size-4.5" />
          {status.text}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-sm">{checked ? "Active" : "Inactive"}</span>
          <Switch id={`${channel}-active`} checked={checked} disabled={!providerConnected || pending} onCheckedChange={toggle} aria-label={`Activate ${label}`} />
        </div>
      </div>
      {!providerConnected && (
        <p className="text-sm text-muted-foreground">
          {label} has been switched off for your account by the Platterly team. Contact us to turn it back on.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </SettingsPanel>
  );
}

/** Per-message on/off switches with one Save button. "Coming Soon" messages are greyed out. */
export function ChannelPreferences({
  channel,
  title,
  description,
  messages: initial,
  saveLabel,
  disabled = false,
}: {
  channel: SettingsChannel;
  title: string;
  description: string;
  messages: ChannelSettings["messages"];
  saveLabel: string;
  /** The channel is switched off as a whole, so no message can be switched on until it is activated. */
  disabled?: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveChannelMessagesAction(channel, messages);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Message settings saved.");
      router.refresh();
    });
  }

  return (
    <SettingsPanel>
      <PanelHeader icon={Bell} title={title} description={description} />
      <ul className="flex flex-col divide-y divide-border">
        {CHANNEL_CONFIG[channel].messages.map((message) => {
          const Icon = MESSAGE_ICON[message.key];
          return (
            <li key={message.key} className={cn("flex items-center gap-3 py-3 first:pt-0 last:pb-0", !message.available && "opacity-50")}>
              <Icon className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <Label htmlFor={`${channel}-${message.key}`} className="text-sm font-medium">
                  {message.label}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {message.description}
                  {!message.available && " (Coming Soon)"}
                </p>
              </div>
              <Switch
                id={`${channel}-${message.key}`}
                checked={messages[message.key] === true}
                disabled={!message.available || disabled}
                onCheckedChange={(on) => setMessages((prev) => ({ ...prev, [message.key]: on }))}
              />
            </li>
          );
        })}
      </ul>
      <FormFooter error={error} success={null}>
        <Button onClick={save} disabled={pending || disabled}>
          {pending ? "Saving…" : saveLabel}
        </Button>
      </FormFooter>
    </SettingsPanel>
  );
}
