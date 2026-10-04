import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { ValidationError } from "@/lib/errors";
import { checkName } from "@/lib/validation";
import { cleanScopes, type ApiScope } from "./scopes";

/**
 * Chunk 25 — API keys. A key looks like `plt_live_<prefix>_<secret>`: the prefix is not secret (it finds the key and
 * names it in the list), the secret is 256 bits of randomness. Only a SHA-256 hash of the whole key is stored, which is
 * enough for a secret this long, so a copy of the database cannot be used to call the API. The key is shown once.
 */
const MAX_ACTIVE_KEYS = 20;
const KEY_PATTERN = /^plt_live_([a-f0-9]{12})_([A-Za-z0-9_-]{43})$/;
const LAST_USED_REFRESH_MS = 60_000;

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

const view = (k: { id: string; name: string; prefix: string; scopes: string[]; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null }): ApiKeyView => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  scopes: k.scopes,
  createdAt: k.createdAt,
  lastUsedAt: k.lastUsedAt,
  revokedAt: k.revokedAt,
});

/** Never includes the hash or the key. */
export async function listApiKeys(organizationId: string): Promise<ApiKeyView[]> {
  const rows = await prisma.apiKey.findMany({ where: { organizationId }, orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }] });
  return rows.map(view);
}

/** Returns the key itself exactly once; after this only its prefix can be seen. */
export async function createApiKey(organizationId: string, input: { name: string; scopes: unknown }, actorUserId: string): Promise<{ key: string; apiKey: ApiKeyView }> {
  const name = checkName(input.name, "key name", 80);
  const scopes = cleanScopes(input.scopes);
  if (scopes.length === 0) throw new ValidationError("Choose at least one permission for this key.");
  if ((await prisma.apiKey.count({ where: { organizationId, revokedAt: null } })) >= MAX_ACTIVE_KEYS) throw new ValidationError(`A kitchen can have ${MAX_ACTIVE_KEYS} active API keys. Revoke one you no longer use.`);

  const prefix = randomBytes(6).toString("hex");
  const key = `plt_live_${prefix}_${randomBytes(32).toString("base64url")}`;
  const row = await prisma.apiKey.create({ data: { organizationId, name, prefix, keyHash: hash(key), scopes, createdByUserId: actorUserId } });
  await audit({ organizationId, actorUserId, action: "api_key.create", recordType: "ApiKey", recordId: row.id, after: { name, prefix, scopes } });
  return { key, apiKey: view(row) };
}

export async function revokeApiKey(organizationId: string, id: string, actorUserId: string): Promise<void> {
  const key = await prisma.apiKey.findFirst({ where: { id, organizationId } });
  if (!key) throw new ValidationError("That API key doesn't exist.");
  if (key.revokedAt) return;
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit({ organizationId, actorUserId, action: "api_key.revoke", recordType: "ApiKey", recordId: id, before: { name: key.name, prefix: key.prefix } });
}

export type ApiAuthResult =
  | { ok: true; organizationId: string; apiKeyId: string; scopes: ApiScope[]; name: string }
  | { ok: false; reason: "missing" | "malformed" | "invalid" | "revoked" };

/**
 * Who is calling. Looks the key up by its prefix, then compares the hash in constant time. A revoked key stops working
 * on its very next request. `lastUsedAt` is refreshed at most once a minute so a busy integration does not write on every call.
 */
export async function authenticateApiKey(authorization: string | null): Promise<ApiAuthResult> {
  if (!authorization) return { ok: false, reason: "missing" };
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  const key = match?.[1];
  const parts = key ? KEY_PATTERN.exec(key) : null;
  if (!key || !parts) return { ok: false, reason: key ? "malformed" : "missing" };

  const row = await prisma.apiKey.findUnique({ where: { prefix: parts[1] } });
  // Compare against a hash even when the prefix is unknown, so a miss and a near-miss take the same time.
  const stored = row?.keyHash ?? hash("no-such-key");
  if (!row || !safeEqual(stored, hash(key))) return { ok: false, reason: "invalid" };
  if (row.revokedAt) return { ok: false, reason: "revoked" };

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_REFRESH_MS) {
    await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return { ok: true, organizationId: row.organizationId, apiKeyId: row.id, scopes: cleanScopes(row.scopes), name: row.name };
}
