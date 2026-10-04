import "server-only";
import { prisma } from "@/lib/db";
import { rateLimitState } from "@/lib/rate-limit";
import { ValidationError } from "@/lib/errors";
import { authenticateApiKey } from "@/modules/api/keys";
import type { ApiScope } from "@/modules/api/scopes";
import { billingLockReason } from "@/modules/subscriptions/billing-math";
import { ApiValidationError } from "./schema";

/**
 * Chunk 25 — the one wrapper every public API route goes through, so no route can forget a step:
 *   1. who is calling (the API key, never a tenant id the caller sends) -> 401
 *   2. rate limit per key and per kitchen -> 429 (with X-RateLimit-* headers)
 *   3. is that kitchen allowed to use the product right now (not suspended, trial or plan not ended) -> 403
 *   4. does the key carry the scope this route needs -> 403
 *   5. run the route; turn every failure into the same JSON error shape, never a stack trace or a database message.
 * Success is `{ data }` (or `{ data, meta }` for a page of results).
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (what: string) => new ApiError(404, "NOT_FOUND", `${what} not found.`);

export interface ApiContext {
  request: Request;
  url: URL;
  organizationId: string;
  apiKeyId: string;
  keyName: string;
  scopes: ApiScope[];
  requestId: string;
}

export interface ApiResult {
  status?: number;
  data: unknown;
  meta?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export const ok = (data: unknown, meta?: Record<string, unknown>): ApiResult => ({ data, meta });
export const created = (data: unknown): ApiResult => ({ status: 201, data });
export const page = (rows: unknown[], p: { page: number; perPage: number; total: number }): ApiResult => ({
  data: rows,
  meta: { page: p.page, per_page: p.perPage, total: p.total, total_pages: Math.max(1, Math.ceil(p.total / p.perPage)) },
});

export const RATE_LIMIT_PER_KEY = 120;
export const RATE_LIMIT_PER_KITCHEN = 600;
const WINDOW_MS = 60_000;
export const MAX_BODY_BYTES = 256_000;

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}

function failure(status: number, code: string, message: string, headers: Record<string, string>, details?: unknown): Response {
  return json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, status, headers);
}

/** The id in a path: letters, digits, dash, underscore, up to 64. Anything else cannot be a Platterly id, so it is simply not found. */
export function pathId(value: string | undefined): string {
  if (!value || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw notFound("Resource");
  return value;
}

export async function readJson(request: Request): Promise<unknown> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the body as JSON with Content-Type: application/json.");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "The request body is not valid JSON.");
  }
}

export function apiRoute<P extends Record<string, string> = Record<string, string>>(
  options: { scope: ApiScope | null },
  handler: (ctx: ApiContext, params: P) => Promise<ApiResult>,
): (request: Request, route: { params: Promise<P> }) => Promise<Response> {
  return async (request, route) => {
    const requestId = crypto.randomUUID();
    const headers: Record<string, string> = { "X-Request-Id": requestId };
    try {
      const auth = await authenticateApiKey(request.headers.get("authorization"));
      if (!auth.ok) {
        const message = auth.reason === "revoked" ? "This API key has been revoked." : auth.reason === "missing" ? "Send your API key as Authorization: Bearer <key>." : "The API key is not valid.";
        return failure(401, auth.reason === "revoked" ? "API_KEY_REVOKED" : "UNAUTHENTICATED", message, { ...headers, "WWW-Authenticate": 'Bearer realm="Platterly API"' });
      }

      const perKey = rateLimitState(`api:key:${auth.apiKeyId}`, RATE_LIMIT_PER_KEY, WINDOW_MS);
      const perKitchen = rateLimitState(`api:org:${auth.organizationId}`, RATE_LIMIT_PER_KITCHEN, WINDOW_MS);
      const limited = perKey.limited || perKitchen.limited;
      Object.assign(headers, {
        "X-RateLimit-Limit": String(RATE_LIMIT_PER_KEY),
        "X-RateLimit-Remaining": String(Math.min(perKey.remaining, perKitchen.remaining)),
        "X-RateLimit-Reset": String(Math.ceil(Math.max(perKey.resetMs, limited ? perKitchen.resetMs : 0) / 1000)),
      });
      if (limited) return failure(429, "RATE_LIMITED", "Too many requests. Slow down and retry shortly.", { ...headers, "Retry-After": headers["X-RateLimit-Reset"] });

      const [organization, subscription] = await Promise.all([
        prisma.organization.findUnique({ where: { id: auth.organizationId }, select: { status: true } }),
        prisma.subscription.findFirst({ where: { organizationId: auth.organizationId, endDate: null }, orderBy: { startDate: "desc" }, select: { status: true, trialEndsAt: true, currentPeriodEnd: true } }),
      ]);
      if (!organization || organization.status !== "ACTIVE") return failure(403, "ACCOUNT_INACTIVE", "This kitchen's account is not active.", headers);
      if (billingLockReason(subscription)) return failure(403, "ACCOUNT_LOCKED", "This kitchen's plan has ended. Renew it to use the API again.", headers);

      if (options.scope && !auth.scopes.includes(options.scope)) return failure(403, "INSUFFICIENT_SCOPE", `This API key does not have the "${options.scope}" permission.`, headers);

      const ctx: ApiContext = { request, url: new URL(request.url), organizationId: auth.organizationId, apiKeyId: auth.apiKeyId, keyName: auth.name, scopes: auth.scopes, requestId };
      const result = await handler(ctx, await route.params);
      Object.assign(headers, result.headers ?? {});
      return json({ data: result.data, ...(result.meta ? { meta: result.meta } : {}) }, result.status ?? 200, headers);
    } catch (error) {
      return errorResponse(error, requestId, headers);
    }
  };
}

function errorResponse(error: unknown, requestId: string, headers: Record<string, string>): Response {
  if (error instanceof ApiError) return failure(error.status, error.code, error.message, headers, error.details);
  if (error instanceof ApiValidationError) return failure(422, "VALIDATION_ERROR", "The request is not valid.", headers, error.issues);
  if (error instanceof ValidationError) {
    // Our own plain-language rules (plan limits, "that customer doesn't exist", date rules).
    if (error.name === "PlanLimitError") return failure(403, "PLAN_LIMIT_REACHED", error.message, headers);
    return failure(422, "VALIDATION_ERROR", error.message, headers);
  }
  if ((error as { code?: string })?.code === "P2025") return failure(404, "NOT_FOUND", "Resource not found.", headers);
  // Anything else is ours to fix: log what happened (the error type and request id, not the request data), say nothing of it to the caller.
  console.error("[api]", requestId, (error as Error)?.name ?? "Error", String((error as Error)?.message ?? "").slice(0, 200));
  return failure(500, "INTERNAL_ERROR", "Something went wrong on our side. Quote the request id if you contact support.", headers, { request_id: requestId });
}

/** `page` and `per_page` from the query: 25 by default, at most 100, never unlimited. */
export const PAGE_SIZE_DEFAULT = 25;
export const PAGE_SIZE_MAX = 100;
