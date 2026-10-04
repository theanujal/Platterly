import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/modules/payments/secret-box";
import { signPayload } from "./signing";
import { assertResolvesPublic, assertWebhookUrl, UnsafeWebhookUrlError } from "./url-guard";

/**
 * Chunk 25 — sends one queued webhook and decides what happens next.
 *   2xx                                  -> delivered
 *   5xx, 408, 429, timeout, network error -> try again later (1 min, 5 min, 30 min, 2 h, 12 h), then give up
 *   any other 4xx, a redirect, a blocked address -> failed at once (retrying cannot fix it)
 * A delivery is claimed (its next attempt pushed forward) before the call, so two workers never send it twice at the
 * same moment. After 10 failed deliveries in a row the endpoint is switched off and says why.
 * Timeout 10 s; redirects are never followed; the response body is never stored.
 */
export const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 43200];
export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;
const TIMEOUT_MS = 10_000;
const CLAIM_LOCK_MS = 2 * 60_000;
const DISABLE_AFTER_FAILURES = 10;

type Outcome = { kind: "delivered"; status: number } | { kind: "retry"; status?: number; error: string } | { kind: "failed"; status?: number; error: string };

export function classify(status: number): Outcome {
  if (status >= 200 && status < 300) return { kind: "delivered", status };
  if (status >= 500 || status === 408 || status === 429) return { kind: "retry", status, error: `The receiver answered ${status}.` };
  return { kind: "failed", status, error: status >= 300 && status < 400 ? `The receiver answered ${status} (a redirect, which is not followed).` : `The receiver refused it with ${status}.` };
}

export async function attemptDelivery(deliveryId: string, now: Date = new Date()): Promise<"delivered" | "retry" | "failed" | "skipped"> {
  const delivery = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { endpoint: true } });
  if (!delivery || delivery.status !== "PENDING") return "skipped";
  // Claim it: only the caller whose update matches goes on.
  const claimed = await prisma.webhookDelivery.updateMany({
    where: { id: deliveryId, status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    data: { nextAttemptAt: new Date(now.getTime() + CLAIM_LOCK_MS), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return "skipped";
  const attempt = delivery.attempts + 1;

  const settle = async (outcome: Outcome) => {
    if (outcome.kind === "delivered") {
      await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "DELIVERED", deliveredAt: new Date(), lastStatusCode: outcome.status, lastError: null, nextAttemptAt: null } });
      await prisma.webhookEndpoint.updateMany({ where: { id: delivery.endpointId }, data: { consecutiveFailures: 0 } });
      return "delivered" as const;
    }
    if (outcome.kind === "retry" && attempt < MAX_ATTEMPTS) {
      const delay = RETRY_DELAYS_SECONDS[attempt - 1];
      await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { lastStatusCode: outcome.status ?? null, lastError: outcome.error, nextAttemptAt: new Date(Date.now() + delay * 1000) } });
      return "retry" as const;
    }
    await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "FAILED", lastStatusCode: outcome.status ?? null, lastError: outcome.kind === "retry" ? `${outcome.error} Gave up after ${attempt} tries.` : outcome.error, nextAttemptAt: null } });
    const endpoint = await prisma.webhookEndpoint.update({ where: { id: delivery.endpointId }, data: { consecutiveFailures: { increment: 1 } } });
    if (endpoint.isActive && endpoint.consecutiveFailures >= DISABLE_AFTER_FAILURES) {
      await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { isActive: false, disabledReason: `Switched off after ${DISABLE_AFTER_FAILURES} failed deliveries in a row. Fix the receiver, then switch it back on.` } });
    }
    return "failed" as const;
  };

  if (!delivery.endpoint.isActive) return settle({ kind: "failed", error: "The endpoint is switched off." });

  let url: URL;
  try {
    url = assertWebhookUrl(delivery.endpoint.url);
    await assertResolvesPublic(url);
  } catch (error) {
    if (error instanceof UnsafeWebhookUrlError) return settle({ kind: "failed", error: error.message });
    return settle({ kind: "retry", error: "Could not look up the receiver's address." });
  }

  const body = JSON.stringify({ id: delivery.eventId, type: delivery.eventName, created_at: delivery.createdAt.toISOString(), data: delivery.payload });
  const timestamp = Math.floor(Date.now() / 1000);
  let secret: string;
  try {
    secret = decryptSecret(delivery.endpoint.secretEnc);
  } catch {
    return settle({ kind: "failed", error: "The signing secret could not be read. Rotate the secret to fix it." });
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Platterly-Webhooks/1",
        "X-Platterly-Event": delivery.eventName,
        "X-Platterly-Event-Id": delivery.eventId,
        "X-Platterly-Timestamp": String(timestamp),
        "X-Platterly-Signature": signPayload(secret, timestamp, body),
      },
      body,
    });
    return settle(classify(response.status));
  } catch (error) {
    const timedOut = (error as Error)?.name === "TimeoutError" || (error as Error)?.name === "AbortError";
    return settle({ kind: "retry", error: timedOut ? "The receiver did not answer within 10 seconds." : "Could not reach the receiver." });
  }
}

/** The scheduled job: everything pending whose time has come (and anything claimed but never settled, e.g. a crash). */
export async function runDueWebhookDeliveries(now: Date = new Date(), limit = 100): Promise<number> {
  const due = await prisma.webhookDelivery.findMany({ where: { status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, orderBy: { createdAt: "asc" }, take: limit, select: { id: true } });
  let sent = 0;
  for (const { id } of due) if ((await attemptDelivery(id, now)) !== "skipped") sent += 1;
  return sent;
}

const KEEP_DELIVERIES_DAYS = 30;
export async function scrubWebhookDeliveries(now: Date = new Date()): Promise<number> {
  return (await prisma.webhookDelivery.deleteMany({ where: { status: { not: "PENDING" }, createdAt: { lt: new Date(now.getTime() - KEEP_DELIVERIES_DAYS * 86_400_000) } } })).count;
}

export const newEventId = () => `evt_${randomUUID().replace(/-/g, "")}`;
