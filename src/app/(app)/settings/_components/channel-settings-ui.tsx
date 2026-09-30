"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarDays, CheckCircle2, CircleAlert, CreditCard, Info, Mail, MessageCircle, MessageSquare, Pencil, PowerOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CHANNEL_CONFIG,
  TEMPLATE_VARIABLES,
  type ChannelSettings,
  type MessageKey,
  type SettingsChannel,
} from "@/modules/notifications/channel-settings-config";
import { saveChannelMessagesAction, saveChannelTemplateAction, setChannelActiveAction } from "../(sections)/communication/actions";
import { FormFooter, PanelHeader, SettingsPanel } from "./settings-ui";
import { cn } from "cn";

const MESSAGE_ICON: Record<MessageKey, LucideIcon> = {
  orderConfirmation: MessageSquare,
  orderStatusUpdates: Info,
  paymentConfirmation: CreditCard,
  eventReminders: CalendarDays,
  systemAlerts: Bell,
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className={cn("flex items-center gap-2 text-sm font-semibold", status.tone)}>
            <status.icon className="size-4.5" />
            {status.text}
          </p>
          {!providerConnected && (
            <p className="text-sm text-muted-foreground">
              Your {label} provider is connected by the Platterly team. Once it is, you can activate it here.
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm">{checked ? "Active" : "Inactive"}</span>
          <Switch id={`${channel}-active`} checked={checked} disabled={!providerConnected || pending} onCheckedChange={toggle} aria-label={`Activate ${label}`} />
        </div>
      </div>
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
}: {
  channel: SettingsChannel;
  title: string;
  description: string;
  messages: ChannelSettings["messages"];
  saveLabel: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveChannelMessagesAction(channel, messages);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
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
                disabled={!message.available}
                onCheckedChange={(on) => setMessages((prev) => ({ ...prev, [message.key]: on }))}
              />
            </li>
          );
        })}
      </ul>
      <FormFooter error={error} success={saved ? "Saved." : null}>
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : saveLabel}
        </Button>
      </FormFooter>
    </SettingsPanel>
  );
}

const TEMPLATE_TONE = { success: "border-success/25 bg-success/10", info: "border-info/25 bg-info/10" } as const;
const TEMPLATE_TITLE_TONE = { success: "text-success", info: "text-info" } as const;

/** The message templates, each with an inline Edit. Variables are filled in when a message is sent. */
export function ChannelTemplates({ channel, templates }: { channel: SettingsChannel; templates: ChannelSettings["templates"] }) {
  const label = CHANNEL_CONFIG[channel].label;
  return (
    <SettingsPanel>
      <PanelHeader icon={MessageSquare} title="Message Templates" description={`Customize the ${label} messages sent to your customers and team.`} />
      <div className="flex flex-col gap-3">
        {CHANNEL_CONFIG[channel].templates.map((template) => (
          <TemplateCard key={template.key} channel={channel} templateKey={template.key} title={template.title} tone={template.tone} body={templates[template.key]} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Variables you can use: {TEMPLATE_VARIABLES.join(", ")}</p>
    </SettingsPanel>
  );
}

function TemplateCard({ channel, templateKey, title, tone, body }: { channel: SettingsChannel; templateKey: string; title: string; tone: "success" | "info"; body: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveChannelTemplateAction(channel, templateKey, draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border p-4", TEMPLATE_TONE[tone])}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={cn("text-sm font-semibold", TEMPLATE_TITLE_TONE[tone])}>{title}</h3>
        {!editing && (
          <Button
            variant="outline"
            size="md"
            onClick={() => {
              setDraft(body);
              setEditing(true);
            }}
          >
            <Pencil data-icon="inline-start" />
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <>
          <Textarea aria-label={`${title} text`} className="min-h-32 bg-background" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <FormFooter error={error}>
            <Button onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save Template"}
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </FormFooter>
        </>
      ) : (
        <p className="text-sm whitespace-pre-line">{body}</p>
      )}
    </div>
  );
}
