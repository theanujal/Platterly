"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/require-session";
import { answerPrompt, getPushState, removePushSubscription, savePushSubscription, sendPushToUser, setPushEnabled, type BrowserSubscription } from "@/modules/notifications/push";
import type { PromptAnswer } from "@/modules/notifications/push-prompt";

/**
 * Push, for whoever is signed in (a caterer on catering.*, a Super Admin on ops.*): the popup's answers, the
 * device being registered, and the person's own master switch. Every action only ever touches the caller's own row.
 */

export async function savePushSubscriptionAction(subscription: BrowserSubscription): Promise<void> {
  const session = await requireSession();
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) return;
  await savePushSubscription(session.user.id, subscription, (await headers()).get("user-agent"));
  revalidatePath("/", "layout");
}

export async function removePushSubscriptionAction(endpoint: string): Promise<void> {
  const session = await requireSession();
  await removePushSubscription(session.user.id, endpoint);
  revalidatePath("/", "layout");
}

export async function answerPushPromptAction(answer: PromptAnswer): Promise<void> {
  const session = await requireSession();
  if (answer !== "later" && answer !== "never" && answer !== "enabled") return;
  await answerPrompt(session.user.id, answer);
  revalidatePath("/", "layout");
}

export async function setPushEnabledAction(enabled: boolean): Promise<void> {
  const session = await requireSession();
  await setPushEnabled(session.user.id, enabled === true);
  revalidatePath("/settings/communication/push-notifications");
}

export async function sendTestPushAction(): Promise<{ ok: boolean; message: string }> {
  const session = await requireSession();
  const result = await sendPushToUser(session.user.id, { title: "Platterly test", body: "Push notifications are working on this device.", url: "/dashboard" });
  if (result.status === "sent") return { ok: true, message: `Sent to ${result.devices} device(s).` };
  return { ok: false, message: result.reason };
}

export async function getMyPushState() {
  const session = await requireSession();
  return getPushState(session.user.id);
}
