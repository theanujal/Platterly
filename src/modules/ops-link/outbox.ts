import "server-only";
import { newId, parseEvent, signedHeaders, type EventData } from "@platterly/contract";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { opsLink } from "./config";

/**
 * Events to ops go through a small outbox so a slow or stopped ops never breaks a kitchen's request: the event is
 * written first, sent at once on a best-effort basis, and anything left over is retried by the scheduled job
 * (/api/cron/daily). Same retry rules as the Chunk 25 webhooks:
 *   2xx -> sent; 5xx, 408, 429, timeout, network error -> retry at 1m, 5m, 30m, 2h, 12h, then give up; other 4xx -> failed at once.
 */
export const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 43200];
export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;
const TIMEOUT_MS = 5000;
const CLAIM_LOCK_MS = 2 * 60_000;

export type EnqueueInput = EventData & { businessId: string; occurredAt?: Date; dedupeKey?: string };

/** Queues one event. Returns its id, or null when the link is off, the event is invalid, or its dedupe key was already used. Never throws. */
export async function enqueueEvent(input: EnqueueInput): Promise<string | null> {
  try {
    const config = opsLink();
    if (!config) return null;
    const eventId = newId("event");
    const event = { eventId, productKey: config.productKey, businessId: input.businessId, occurredAt: (input.occurredAt ?? new Date()).toISOString(), type: input.type, data: input.data };
    const parsed = parseEvent(event);
    if (!parsed.ok) {
      console.error("[ops-link] refusing to queue an invalid event:", parsed.error);
      return null;
    }
    await prisma.opsOutbox.create({ data: { eventId, type: input.type, businessId: input.businessId, payload: event as Prisma.InputJsonValue, dedupeKey: input.dedupeKey ?? null } });
    return eventId;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    console.error("[ops-link] could not queue an event:", error);
    return null;
  }
}

/** Queue, then try once straight away. A failure here just leaves the event for the scheduled retry. */
export async function emitEvent(input: EnqueueInput): Promise<void> {
  const eventId = await enqueueEvent(input);
  if (eventId) await attemptDelivery(eventId).catch(() => undefined);
}

export type Outcome = "sent" | "retry" | "failed" | "skipped";

export function classify(status: number): { kind: "sent" | "retry" | "failed"; error?: string } {
  if (status >= 200 && status < 300) return { kind: "sent" };
  if (status >= 500 || status === 408 || status === 429) return { kind: "retry", error: `Ops answered ${status}.` };
  return { kind: "failed", error: `Ops refused the event with ${status}.` };
}

export async function attemptDelivery(eventId: string, now: Date = new Date(), fetchImpl: typeof fetch = fetch): Promise<Outcome> {
  const config = opsLink();
  if (!config) return "skipped";
  const row = await prisma.opsOutbox.findUnique({ where: { eventId } });
  if (!row || row.status !== "PENDING") return "skipped";
  const claimed = await prisma.opsOutbox.updateMany({
    where: { eventId, status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    data: { nextAttemptAt: new Date(now.getTime() + CLAIM_LOCK_MS), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return "skipped";
  const attempt = row.attempts + 1;

  let outcome: { kind: "sent" | "retry" | "failed"; error?: string };
  try {
    const body = JSON.stringify(row.payload);
    const response = await fetchImpl(`${config.baseUrl}/api/products/events`, {
      method: "POST",
      headers: signedHeaders(config.eventSecret, row.eventId, body),
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
    outcome = classify(response.status);
  } catch (error) {
    outcome = { kind: "retry", error: error instanceof Error ? `Could not reach ops: ${error.message}` : "Could not reach ops." };
  }

  if (outcome.kind === "sent") {
    await prisma.opsOutbox.update({ where: { eventId }, data: { status: "SENT", sentAt: new Date(), lastError: null, nextAttemptAt: null } });
    return "sent";
  }
  if (outcome.kind === "retry" && attempt < MAX_ATTEMPTS) {
    await prisma.opsOutbox.update({ where: { eventId }, data: { lastError: outcome.error, nextAttemptAt: new Date(Date.now() + RETRY_DELAYS_SECONDS[attempt - 1] * 1000) } });
    return "retry";
  }
  await prisma.opsOutbox.update({ where: { eventId }, data: { status: "FAILED", lastError: outcome.kind === "retry" ? `${outcome.error} Gave up after ${attempt} tries.` : outcome.error, nextAttemptAt: null } });
  return "failed";
}

/** Sends every pending event that has come due. Called by the scheduled job. */
export async function runDueOutbox(now: Date = new Date(), limit = 50): Promise<number> {
  if (!opsLink()) return 0;
  const due = await prisma.opsOutbox.findMany({ where: { status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, orderBy: { createdAt: "asc" }, take: limit, select: { eventId: true } });
  let sent = 0;
  for (const { eventId } of due) if ((await attemptDelivery(eventId, now)) === "sent") sent += 1;
  return sent;
}
