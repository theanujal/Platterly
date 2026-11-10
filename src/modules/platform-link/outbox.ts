import "server-only";
import { newId, verifyRequest } from "@platterly/contract";
import { BUSINESS_CREATED_PATH, parseBusinessCreatedAnswer, signPlatformRequest, PLATFORM_CONTRACT_VERSION, type BusinessCreatedMessage } from "@platterly/platform-contract";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { PLATFORM_CLIENT_ID, platformAuthOrigin } from "@/lib/platform/config";
import { platformSender } from "./config";

/**
 * Messages to the Platform go through a small outbox so a slow or stopped Platform never breaks a sign-up: the message is written first, sent at once on a
 * best-effort basis, and anything left over is retried by the scheduled job (/api/cron/daily). Same retry rules as the Ops outbox:
 *   200 signed by the Platform -> sent; 5xx, 408, 429, `product_not_current`, timeout, network error, an unsigned or unreadable answer -> retry at 1m, 5m, 30m,
 *   2h, 12h, then give up; any other refusal -> failed at once (the error is kept so someone can see why).
 */
export const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 43200];
export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;
const TIMEOUT_MS = 5000;
const CLAIM_LOCK_MS = 2 * 60_000;
const TYPE = "business.created";

/** Queues "business created" once per business. Returns the message id, or null when the link is off or it was already queued. Never throws. */
export async function enqueueBusinessCreated(input: { businessId: string; businessName: string; subject: string }): Promise<string | null> {
  try {
    if (!platformSender()) return null;
    const messageId = newId("command");
    const message: BusinessCreatedMessage = { version: PLATFORM_CONTRACT_VERSION, messageId, type: TYPE, productKey: PLATFORM_CLIENT_ID, businessId: input.businessId, businessName: input.businessName, owner: { subject: input.subject } };
    await prisma.platformOutbox.create({ data: { messageId, type: TYPE, businessId: input.businessId, payload: message as unknown as Prisma.InputJsonValue } });
    return messageId;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    console.error("[platform-link] could not queue a message:", error);
    return null;
  }
}

/** Queue, then try once straight away. A failure leaves the message for the scheduled retry. */
export async function emitBusinessCreated(input: { businessId: string; businessName: string; subject: string }): Promise<void> {
  const messageId = await enqueueBusinessCreated(input);
  if (messageId) await attemptDelivery(messageId).catch(() => undefined);
}

export type Outcome = "sent" | "retry" | "failed" | "skipped";
type Verdict = { kind: "sent" | "retry" | "failed"; error?: string };

export async function classify(response: Response, answerSecret: string): Promise<Verdict> {
  const text = await response.text().catch(() => "");
  if (response.status >= 500 || response.status === 408 || response.status === 429) return { kind: "retry", error: `The Platform answered ${response.status}.` };
  // Only an answer signed with our own secret counts: anything else could be a proxy or an error page, so it is tried again, never taken as "sent".
  const signed = verifyRequest([answerSecret], response.headers, text).ok;
  if (!signed) return { kind: "retry", error: `The Platform's answer (${response.status}) was not signed.` };
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* handled below */ }
  if (response.status === 200) return parseBusinessCreatedAnswer(json).ok ? { kind: "sent" } : { kind: "retry", error: "The Platform's answer could not be read." };
  const code = typeof (json as { error?: unknown } | null)?.error === "string" ? (json as { error: string }).error : `status_${response.status}`;
  return code === "product_not_current" ? { kind: "retry", error: "The Platform has not switched this product on yet." } : { kind: "failed", error: `The Platform refused: ${code}.` };
}

export async function attemptDelivery(messageId: string, now: Date = new Date(), fetchImpl: typeof fetch = fetch): Promise<Outcome> {
  const sender = platformSender();
  if (!sender) return "skipped";
  const row = await prisma.platformOutbox.findUnique({ where: { messageId } });
  if (!row || row.status !== "PENDING") return "skipped";
  const claimed = await prisma.platformOutbox.updateMany({
    where: { messageId, status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    data: { nextAttemptAt: new Date(now.getTime() + CLAIM_LOCK_MS), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return "skipped";
  const attempt = row.attempts + 1;

  let verdict: Verdict;
  try {
    const body = JSON.stringify(row.payload);
    const url = `${platformAuthOrigin()}${BUSINESS_CREATED_PATH}`;
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...signPlatformRequest(sender.answerSecret, row.messageId, body, "POST", url) },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
    verdict = await classify(response, sender.answerSecret);
  } catch (error) {
    verdict = { kind: "retry", error: error instanceof Error ? `Could not reach the Platform: ${error.message}` : "Could not reach the Platform." };
  }

  if (verdict.kind === "sent") {
    await prisma.platformOutbox.update({ where: { messageId }, data: { status: "SENT", sentAt: new Date(), lastError: null, nextAttemptAt: null } });
    return "sent";
  }
  if (verdict.kind === "retry" && attempt < MAX_ATTEMPTS) {
    await prisma.platformOutbox.update({ where: { messageId }, data: { lastError: verdict.error, nextAttemptAt: new Date(Date.now() + RETRY_DELAYS_SECONDS[attempt - 1] * 1000) } });
    return "retry";
  }
  await prisma.platformOutbox.update({ where: { messageId }, data: { status: "FAILED", lastError: verdict.kind === "retry" ? `${verdict.error} Gave up after ${attempt} tries.` : verdict.error, nextAttemptAt: null } });
  return "failed";
}

/** Sends every pending message that has come due. Called by the scheduled job. */
export async function runDuePlatformOutbox(now: Date = new Date(), limit = 50): Promise<number> {
  if (!platformSender()) return 0;
  const due = await prisma.platformOutbox.findMany({ where: { status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, orderBy: { createdAt: "asc" }, take: limit, select: { messageId: true } });
  let sent = 0;
  for (const { messageId } of due) if ((await attemptDelivery(messageId, now)) === "sent") sent += 1;
  return sent;
}
