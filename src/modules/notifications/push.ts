import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/db";
import { nextPromptRecord, shouldShowPrompt, type PromptAnswer } from "./push-prompt";

/**
 * Chunk 16.3: Web Push. A person enables it per browser/device (`PushSubscription`) and has one master switch
 * (`User.pushEnabled`). Needs VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT; without them nothing is sent
 * and the popup is never shown, so dev and CI need no setup.
 */

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string | null {
  return pushConfigured() ? (process.env.VAPID_PUBLIC_KEY ?? null) : null;
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:noreply@platterly.in", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function savePushSubscription(userId: string, subscription: BrowserSubscription, userAgent?: string | null) {
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: { userId, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userAgent: userAgent?.slice(0, 300) },
    update: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userAgent: userAgent?.slice(0, 300) },
  });
  await answerPrompt(userId, "enabled");
  await prisma.user.update({ where: { id: userId }, data: { pushEnabled: true } });
}

export async function removePushSubscription(userId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export async function setPushEnabled(userId: string, enabled: boolean) {
  await prisma.user.update({ where: { id: userId }, data: { pushEnabled: enabled } });
}

export async function getPushState(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { pushEnabled: true, pushPromptState: true, pushPromptCount: true, pushPromptNextAt: true, _count: { select: { pushSubscriptions: true } } },
  });
  return { enabled: user.pushEnabled, devices: user._count.pushSubscriptions, showPrompt: pushConfigured() && shouldShowPrompt(user) };
}

export async function answerPrompt(userId: string, answer: PromptAnswer) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { pushPromptState: true, pushPromptCount: true, pushPromptNextAt: true } });
  await prisma.user.update({ where: { id: userId }, data: nextPromptRecord(user, answer) });
}

export interface PushMessage {
  title: string;
  body: string;
  /** Path to open when the notification is clicked, e.g. `/orders/abc`. */
  url?: string;
}

export type PushResult = { status: "sent"; devices: number } | { status: "skipped"; reason: string } | { status: "failed"; reason: string };

/** Sends to every device the person enabled. A device the browser says is gone (404/410) is forgotten. */
export async function sendPushToUser(userId: string, message: PushMessage): Promise<PushResult> {
  if (!pushConfigured()) return { status: "skipped", reason: "Push is not configured." };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { pushEnabled: true, pushSubscriptions: true } });
  if (!user) return { status: "skipped", reason: "No such user." };
  if (!user.pushEnabled) return { status: "skipped", reason: "The person switched push off." };
  if (user.pushSubscriptions.length === 0) return { status: "skipped", reason: "No device has push enabled." };

  configure();
  const body = JSON.stringify({ title: message.title, body: message.body, url: message.url ?? "/" });
  let delivered = 0;
  let lastError = "";
  for (const sub of user.pushSubscriptions) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, { TTL: 60 * 60 * 24 });
      delivered += 1;
      await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } });
    } catch (error) {
      const code = (error as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      lastError = error instanceof Error ? error.message : "Send failed";
    }
  }
  return delivered > 0 ? { status: "sent", devices: delivered } : { status: "failed", reason: lastError || "No device accepted the message." };
}
