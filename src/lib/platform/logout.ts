import { validateLogoutToken } from "@platterly/platform-contract";
import type { PrismaClient } from "@/generated/prisma/client";
import { PLATFORM_CLIENT_ID, PLATFORM_PROVIDER_ID, platformIssuer } from "./config";

export type PlatformLogoutOutcome = { status: 200; ended: number } | { status: 400; error: "invalid_request" | "invalid_token" | "replayed" };

type Db = Pick<PrismaClient, "account" | "session" | "verification">;
type Key = Parameters<typeof validateLogoutToken>[1]["key"];

const JTI_PREFIX = "platform-logout-jti:";

/**
 * The back-channel logout endpoint (F8.1.3, OIDC Back-Channel Logout 1.0). Platterly's identity provider calls it when a person's central session ends, so
 * a Caterly session never outlives it. Nothing happens until the token passes `validateLogoutToken` (signature from the provider's keys, issuer, THIS
 * product's audience, `logout+jwt` type, the logout event, no nonce, a jti, a sub or sid). A jti is used once. The central subject is mapped to the
 * Caterly user through the linked account row (provider "platterly", account id = subject), never by email, and every session of that user ends: Caterly
 * does not store the central session id, so ending all of the person's sessions is the plan's "revoking by sub". An unknown subject answers 200 with nothing
 * ended (the person has no Caterly user, so there is nothing to do).
 */
export async function handlePlatformLogout(input: { db: Db; body: string; key: Key; now?: Date }): Promise<PlatformLogoutOutcome> {
  const now = input.now ?? new Date();
  const token = new URLSearchParams(input.body).get("logout_token");
  if (!token) return { status: 400, error: "invalid_request" };
  const result = await validateLogoutToken(token, { key: input.key, issuer: platformIssuer(), audience: PLATFORM_CLIENT_ID, now });
  if (!result.ok) return { status: 400, error: "invalid_token" };

  // Replay guard in Better Auth's own `verification` table (no schema change). A repeat that races past this check only re-ends sessions already ended.
  const identifier = `${JTI_PREFIX}${result.jti}`;
  await input.db.verification.deleteMany({ where: { identifier: { startsWith: JTI_PREFIX }, expiresAt: { lt: now } } });
  if (await input.db.verification.findFirst({ where: { identifier }, select: { id: true } })) return { status: 400, error: "replayed" };
  await input.db.verification.create({ data: { id: crypto.randomUUID(), identifier, value: "used", expiresAt: new Date(result.exp * 1000 + 60_000) } });

  if (!result.sub) return { status: 200, ended: 0 };
  const link = await input.db.account.findFirst({ where: { providerId: PLATFORM_PROVIDER_ID, accountId: result.sub }, select: { userId: true } });
  if (!link) return { status: 200, ended: 0 };
  const { count } = await input.db.session.deleteMany({ where: { userId: link.userId } });
  return { status: 200, ended: count };
}
