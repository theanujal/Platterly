import "server-only";
import { prisma } from "@/lib/db";
import type { NotificationChannel } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { getChannelSettings } from "@/modules/notifications/channel-settings";
import { MESSAGE_FOR_EVENT } from "@/modules/notifications/channel-settings-config";
import { sendPushToUser } from "@/modules/notifications/push";
import { emailForEvent } from "./email/templates";
import { sendEmail } from "./email/zeptomail";

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
  const whatsAppMessages: Prisma.WhatsAppMessageCreateWithoutNotificationInput[] =
    params.channel === "WHATSAPP" && params.recipient.phone && !whatsAppBlocked
      ? [
          {
            organization: { connect: { id: params.organizationId } },
            toPhone: params.recipient.phone,
            body: JSON.stringify(params.payload),
            status: "queued",
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
