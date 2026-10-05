import "server-only";
import { newId, parseCommand, signedHeaders, verifyRequest, type Command, type EntitlementDef, type ProductManifest } from "@platterly/contract";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { secretsOf } from "@/modules/registry/products";

/**
 * Commands to products (docs/ops-contract.md section 6) go through an outbox, like events do in the other direction: the
 * command is written first, sent at once on a best-effort basis, and whatever is left is retried by the scheduled job.
 *   2xx (and a correctly signed reply) -> sent
 *   5xx (except 501), 408, 429, timeout, network error -> retry at 1m, 5m, 30m, 2h, 12h, then give up
 *   any other 4xx, and 501 not supported yet -> failed at once; retrying cannot change the answer
 * A command is claimed (its next attempt pushed forward) before it is sent, so two workers never send it twice together.
 */
export const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 43200];
export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;
const TIMEOUT_MS = 8000;
const CLAIM_LOCK_MS = 2 * 60_000;

/** A command without its id (ops mints that) plus where it goes. */
export type OutboundInput = { productKey: string; dedupeKey?: string; command: Command extends infer C ? (C extends Command ? Omit<C, "commandId"> : never) : never };
export type Outcome = "sent" | "retry" | "failed" | "skipped";

export function classify(status: number): { kind: "sent" | "retry" | "failed"; error?: string } {
  if (status >= 200 && status < 300) return { kind: "sent" };
  // 501 is the product saying "not built yet": waiting will not change it.
  if ((status >= 500 && status !== 501) || status === 408 || status === 429) return { kind: "retry", error: `The product answered ${status}.` };
  return { kind: "failed", error: `The product refused the command with ${status}.` };
}

export class OutboxError extends Error {}

/**
 * Queues one command. Returns its id, or null when its dedupe key was already used. The command is validated against the
 * product's own manifest (when ops has read one), so a snapshot with an unknown entitlement is refused here, not by the product.
 */
export async function enqueueCommand(input: OutboundInput): Promise<string | null> {
  const product = await prisma.product.findUnique({ where: { key: input.productKey } });
  if (!product) throw new OutboxError(`Unknown product "${input.productKey}".`);
  const manifest = product.manifest as unknown as ProductManifest | null;
  const defs: EntitlementDef[] | undefined = manifest?.entitlements;
  const commandId = newId("command");
  const body = { commandId, ...input.command };
  const parsed = parseCommand(body, defs);
  if (!parsed.ok) throw new OutboxError(`Invalid command: ${parsed.error}`);
  try {
    await prisma.outboundCommand.create({ data: { commandId, productKey: input.productKey, businessId: input.command.businessId, type: input.command.type, payload: body as Prisma.InputJsonValue, dedupeKey: input.dedupeKey ?? null } });
    return commandId;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
}

/** Queue, then try once straight away. A failure here just leaves the command for the scheduled retry. */
export async function sendCommand(input: OutboundInput, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const commandId = await enqueueCommand(input);
  if (commandId) await attemptCommand(commandId, new Date(), fetchImpl).catch(() => undefined);
  return commandId;
}

export async function attemptCommand(commandId: string, now: Date = new Date(), fetchImpl: typeof fetch = fetch): Promise<Outcome> {
  const row = await prisma.outboundCommand.findUnique({ where: { commandId }, include: { product: true } });
  if (!row || row.status !== "PENDING") return "skipped";
  const claimed = await prisma.outboundCommand.updateMany({
    where: { commandId, status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    data: { nextAttemptAt: new Date(now.getTime() + CLAIM_LOCK_MS), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return "skipped";
  const attempt = row.attempts + 1;

  const settle = async (outcome: { kind: "sent" | "retry" | "failed"; error?: string; status?: number; response?: unknown }): Promise<Outcome> => {
    const common = { lastStatusCode: outcome.status ?? null, ...(outcome.response !== undefined ? { response: outcome.response as Prisma.InputJsonValue } : {}) };
    if (outcome.kind === "sent") {
      await prisma.outboundCommand.update({ where: { commandId }, data: { ...common, status: "SENT", sentAt: new Date(), lastError: null, nextAttemptAt: null } });
      return "sent";
    }
    if (outcome.kind === "retry" && attempt < MAX_ATTEMPTS) {
      await prisma.outboundCommand.update({ where: { commandId }, data: { ...common, lastError: outcome.error, nextAttemptAt: new Date(Date.now() + RETRY_DELAYS_SECONDS[attempt - 1] * 1000) } });
      return "retry";
    }
    await prisma.outboundCommand.update({ where: { commandId }, data: { ...common, status: "FAILED", lastError: outcome.kind === "retry" ? `${outcome.error} Gave up after ${attempt} tries.` : outcome.error, nextAttemptAt: null } });
    return "failed";
  };

  if (row.product.status !== "ACTIVE") return settle({ kind: "failed", error: "The product is disabled." });

  let secrets: ReturnType<typeof secretsOf>;
  try {
    secrets = secretsOf(row.product);
  } catch {
    return settle({ kind: "failed", error: "The product's signing secret could not be read. Rotate its secrets." });
  }

  const body = JSON.stringify(row.payload);
  try {
    const response = await fetchImpl(`${row.product.baseUrl}/api/ops/commands`, {
      method: "POST",
      headers: signedHeaders(secrets.sign, row.commandId, body),
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
    const text = await response.text();
    const verdict = classify(response.status);
    let reply: unknown;
    try {
      reply = JSON.parse(text);
    } catch {
      reply = undefined;
    }
    if (verdict.kind === "sent") {
      // A success only counts if the product really signed it (it is the proof the right product received the command).
      const verified = verifyRequest(secrets.accept, response.headers, text);
      if (!verified.ok) return settle({ kind: "failed", status: response.status, error: `The product's reply was not signed correctly (${verified.reason}).`, response: reply });
    }
    return settle({ ...verdict, status: response.status, response: reply });
  } catch (error) {
    return settle({ kind: "retry", error: error instanceof Error ? `Could not reach the product: ${error.message}` : "Could not reach the product." });
  }
}

/** Sends every pending command that has come due. Called by the scheduled job. */
export async function runDueCommands(now: Date = new Date(), limit = 50, productKey?: string): Promise<number> {
  const due = await prisma.outboundCommand.findMany({ where: { status: "PENDING", ...(productKey ? { productKey } : {}), OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, orderBy: { createdAt: "asc" }, take: limit, select: { commandId: true } });
  let sent = 0;
  for (const { commandId } of due) if ((await attemptCommand(commandId, now)) === "sent") sent += 1;
  return sent;
}
