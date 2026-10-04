import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { ApiError, type ApiContext, type ApiResult } from "./handler";

/**
 * Chunk 25 — `Idempotency-Key` for the API's create calls (a new order, a new customer). Send the same key and the same
 * body twice (a retry after a timeout) and the second call returns the first response instead of creating a duplicate.
 * The same key with a different body is refused, and a key still being worked on answers 409. A request that fails
 * releases its key so it can be retried. Keys are kept for 24 hours.
 */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,200}$/;

export async function withIdempotency(ctx: ApiContext, body: unknown, run: () => Promise<ApiResult>): Promise<ApiResult> {
  const key = ctx.request.headers.get("idempotency-key");
  if (!key) return run();
  if (!KEY_PATTERN.test(key)) throw new ApiError(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 8 to 200 letters, digits, dots, dashes, colons or underscores.");
  const requestHash = createHash("sha256").update(`${ctx.request.method} ${ctx.url.pathname}\n${JSON.stringify(body)}`).digest("hex");

  const fresh = await prisma.apiIdempotencyKey
    .create({ data: { organizationId: ctx.organizationId, apiKeyId: ctx.apiKeyId, key, requestHash } })
    .catch((error: { code?: string }) => {
      if (error.code === "P2002") return null;
      throw error;
    });

  if (!fresh) {
    const existing = await prisma.apiIdempotencyKey.findUnique({ where: { organizationId_key: { organizationId: ctx.organizationId, key } } });
    if (existing && Date.now() - existing.createdAt.getTime() > IDEMPOTENCY_TTL_MS) {
      // Too old to mean "the same request": start over with this key.
      await prisma.apiIdempotencyKey.deleteMany({ where: { id: existing.id } });
      return withIdempotency(ctx, body, run);
    }
    if (!existing || existing.requestHash !== requestHash) throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different request.");
    if (existing.responseStatus === null) throw new ApiError(409, "REQUEST_IN_PROGRESS", "A request with this Idempotency-Key is still being processed. Retry shortly.");
    return { status: existing.responseStatus, data: (existing.responseBody as { data: unknown }).data, headers: { "Idempotent-Replayed": "true" } };
  }

  try {
    const result = await run();
    await prisma.apiIdempotencyKey.update({ where: { id: fresh.id }, data: { responseStatus: result.status ?? 200, responseBody: { data: result.data } as never } });
    return result;
  } catch (error) {
    await prisma.apiIdempotencyKey.deleteMany({ where: { id: fresh.id } });
    throw error;
  }
}

/** Housekeeping for the scheduled job. */
export async function scrubIdempotencyKeys(now: Date = new Date()): Promise<number> {
  return (await prisma.apiIdempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - IDEMPOTENCY_TTL_MS) } } })).count;
}
