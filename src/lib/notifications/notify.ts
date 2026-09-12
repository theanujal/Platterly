import "server-only";
import { prisma } from "@/lib/db";
import type { NotificationChannel } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

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

/**
 * Chunk 2 Group 2.1 — log-only notification driver. Every module that needs
 * to send something calls this exact function; real WhatsApp/ZeptoMail/
 * Push/SMS providers are wired in behind it in Chunk 16 without callers
 * changing. For now it only ever writes rows — nothing is actually sent.
 */
export async function notify(params: NotifyParams) {
  const whatsAppMessages: Prisma.WhatsAppMessageCreateWithoutNotificationInput[] =
    params.channel === "WHATSAPP" && params.recipient.phone
      ? [
          {
            organization: { connect: { id: params.organizationId } },
            toPhone: params.recipient.phone,
            body: JSON.stringify(params.payload),
            status: "queued",
          },
        ]
      : [];

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
        create: { status: "logged", detail: "No provider configured (Chunk 16)." },
      },
      whatsAppMessages: { create: whatsAppMessages },
    },
    include: { logs: true, whatsAppMessages: true },
  });
}
