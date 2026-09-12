import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import type { SecureAccessResourceType } from "@/generated/prisma/enums";

export interface IssueTokenParams {
  organizationId: string;
  resourceType: SecureAccessResourceType;
  resourceId: string;
  /** Omit for a token that never expires (e.g. an invoice link). */
  expiresInDays?: number;
}

export interface ResolvedToken {
  organizationId: string;
  resourceType: SecureAccessResourceType;
  resourceId: string;
}

/**
 * Chunk 2 Group 2.4 — generic token issuance for the `/menu/{secure-token}`
 * pattern (PRD §25), shared by Quotation/Menu-Selection/Invoice/Payment-Link
 * (Chunks 10, 11, 14). The Public Storefront's human-readable slug (Chunk 8)
 * is a *separate* mechanism built on Chunk 1's routing, not this service.
 */
export async function issueToken(params: IssueTokenParams) {
  const token = randomBytes(24).toString("base64url");
  return prisma.secureAccessToken.create({
    data: {
      organizationId: params.organizationId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      token,
      expiresAt: params.expiresInDays
        ? new Date(Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000)
        : null,
    },
  });
}

/**
 * Returns `null` — never throws — for missing, expired, or revoked tokens,
 * so a caller can't distinguish "wrong token" from "expired token" by
 * catching a different error shape (no tenant/resource leakage via probing).
 */
export async function resolveToken(token: string): Promise<ResolvedToken | null> {
  const row = await prisma.secureAccessToken.findUnique({ where: { token } });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  return {
    organizationId: row.organizationId,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
  };
}

export async function revokeToken(token: string): Promise<void> {
  await prisma.secureAccessToken.updateMany({
    where: { token, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revokes the old token and issues a fresh one for the same resource. */
export async function regenerateToken(oldToken: string): Promise<Awaited<ReturnType<typeof issueToken>> | null> {
  const resolved = await resolveToken(oldToken);
  if (!resolved) return null;
  await revokeToken(oldToken);
  return issueToken(resolved);
}
