import "server-only";
import { prisma } from "@/lib/db";
import type { NotificationChannel } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { getChannelSettings } from "@/modules/notifications/channel-settings";
import { MESSAGE_FOR_EVENT } from "@/modules/notifications/channel-settings-config";
import { sendPushToUser } from "@/modules/notifications/push";
import { emailForEvent } from "./email/templates";
import { sendEmail } from "./email/zeptomail";
import { getSetting } from "@/lib/settings/settings";
import { sendWacrmMessage, wacrmConfig } from "./whatsapp/wacrm";
import { WHATSAPP_TEMPLATES, cleanParams, renderTemplate } from "./whatsapp/templates";

export interface NotifyRecipient {
  email?: string;
  phone?: string;
  userId?: string;
}

export interface NotifyParams {
  organizationId: string;
  channel: NotificationChannel;
  /** Free-form event key, e.g. "quotation.sent", "order.confirmed". */
  event: string;
  recipient: NotifyRecipient;
  payload: Prisma.InputJsonValue;
}

/** Invitations and security codes always go out; every other email or WhatsApp needs the channel active and its switch on. */
async function channelAllowed(organizationId: string, channel: "email" | "whatsapp", event: string): Promise<boolean> {
  // WhatsApp goes only to the kitchen's own team, for a fixed short list of events (AJ, 2026-10-09), so it has no
  // per-message switches: it is on unless the Platterly team disconnected this kitchen.
  if (channel === "whatsapp") return (await getSetting<{ connected?: boolean }>(organizationId, "notifications.whatsapp.provider"))?.connected !== false;
  const message = MESSAGE_FOR_EVENT[event];
  if (!message) return true;
  const settings = await getChannelSettings(organizationId, channel);
  return settings.active && settings.messages[message] === true;
}

/**
 * Chunk 2 Group 2.1 — log-only notification driver. Every module that needs
 * to send something calls this exact function; real WhatsApp/ZeptoMail/
 * Push providers are wired in behind it in Chunk 16 without callers
 * changing. Every call writes a row. Email is really sent for events with a template (see email/templates.ts)
 * when ZeptoMail is configured and the kitchen has the channel active with the message switched on.
 */
export async function notify(params: NotifyParams) {
  // WhatsApp: no message row (nothing queued to send) while the channel is off or this message is switched off.
  const whatsAppBlocked = params.channel === "WHATSAPP" && !(await channelAllowed(params.organizationId, "whatsapp", params.event));
  // WhatsApp really goes out once the Wacrm account is configured, and only for the events that have a template;
  // before that the row stays queued, as it always was.
  const template = WHATSAPP_TEMPLATES[params.event];
  const whatsAppPhone = params.channel === "WHATSAPP" && !whatsAppBlocked ? params.recipient.phone : undefined;
  const wacrm = wacrmConfig();
  const templateParams = cleanParams(((params.payload as { whatsappParams?: unknown[] }).whatsappParams ?? []) as unknown[]);
  const whatsAppText = template ? renderTemplate(template.body, templateParams) : JSON.stringify(params.payload);
  const sent = whatsAppPhone && wacrm && template ? await sendWacrmMessage(wacrm, { to: whatsAppPhone, text: whatsAppText, template: { name: template.name, params: templateParams } }) : null;
  const whatsAppMessages: Prisma.WhatsAppMessageCreateWithoutNotificationInput[] = whatsAppPhone
    ? [
        {
          organization: { connect: { id: params.organizationId } },
          toPhone: sent?.to ?? whatsAppPhone,
          body: sent ? whatsAppText : JSON.stringify(params.payload),
          status: sent ? (sent.status === "sent" ? "sent" : "failed") : "queued",
          providerMessageId: sent?.status === "sent" ? sent.providerMessageId : undefined,
        },
      ]
    : [];

  // Email goes out for events that have a template, once ZeptoMail is configured; anything else stays log-only.
  let logEntry = { status: "logged", detail: "No provider configured (Chunk 16)." };
  if (params.channel === "EMAIL" && params.recipient.email) {
    const rendered = emailForEvent(params.event, params.payload);
    if (rendered && !(await channelAllowed(params.organizationId, "email", params.event))) {
      logEntry = { status: "skipped", detail: "Email is not connected, not active, or this message is switched off in Settings." };
    } else if (rendered) {
      const result = await sendEmail({ to: params.recipient.email, ...rendered });
      if (result.status === "sent") logEntry = { status: "sent", detail: result.providerMessageId ?? "ZeptoMail" };
      else if (result.status === "failed") logEntry = { status: "failed", detail: result.reason };
    }
  }

  // Push: the in-app title/message, sent to the person's enabled devices (only if they switched push on).
  if (params.channel === "PUSH" && params.recipient.userId) {
    const data = params.payload as { title?: string; message?: string; orderId?: string; href?: string };
    const result = await sendPushToUser(params.recipient.userId, {
      title: data.title ?? "Platterly",
      body: data.message ?? "",
      url: data.href ?? (data.orderId ? `/orders/${data.orderId}` : "/dashboard"),
    });
    logEntry =
      result.status === "sent"
        ? { status: "sent", detail: `${result.devices} device(s)` }
        : { status: result.status, detail: result.reason };
  }

  if (sent) logEntry = sent.status === "sent" ? { status: "sent", detail: sent.providerMessageId } : { status: "failed", detail: sent.reason };
  if (whatsAppBlocked) logEntry = { status: "skipped", detail: "WhatsApp is not connected, not active, or this message is switched off in Settings." };

  return prisma.notification.create({
    data: {
      organizationId: params.organizationId,
      channel: params.channel,
      event: params.event,
      recipientEmail: params.recipient.email,
      recipientPhone: params.recipient.phone,
      recipientUserId: params.recipient.userId,
      payload: params.payload,
      logs: {
        create: logEntry,
      },
      whatsAppMessages: { create: whatsAppMessages },
    },
    include: { logs: true, whatsAppMessages: true },
  });
}
