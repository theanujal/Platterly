import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { issueToken, resolveToken, revokeToken, regenerateToken } from "@/lib/secure-access/token";

const cleanupOrgIds: string[] = [];

afterEach(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  cleanupOrgIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Token Test Org", slug: `token-${crypto.randomUUID()}`, createdAt: new Date() },
  });
  cleanupOrgIds.push(org.id);
  return org;
}

describe("secure access tokens (Chunk 2 Group 2.4) — the chunk file's explicit Verify line", () => {
  it("issues and resolves a valid token to the right resource", async () => {
    const org = await makeOrg();
    const issued = await issueToken({ organizationId: org.id, resourceType: "QUOTATION", resourceId: "q_1" });

    const resolved = await resolveToken(issued.token);
    expect(resolved).toEqual({ organizationId: org.id, resourceType: "QUOTATION", resourceId: "q_1" });
  });

  it("returns null (not an error) for an expired token", async () => {
    const org = await makeOrg();
    const issued = await prisma.secureAccessToken.create({
      data: {
        organizationId: org.id,
        resourceType: "MENU_SELECTION",
        resourceId: "ms_1",
        token: crypto.randomUUID(),
        expiresAt: new Date(Date.now() - 1000), // already expired
      },
    });

    expect(await resolveToken(issued.token)).toBeNull();
  });

  it("returns null for a revoked token", async () => {
    const org = await makeOrg();
    const issued = await issueToken({ organizationId: org.id, resourceType: "INVOICE", resourceId: "inv_1" });
    await revokeToken(issued.token);

    expect(await resolveToken(issued.token)).toBeNull();
  });

  it("returns null for a guessed/unknown token — same shape as expired/revoked, no leakage", async () => {
    expect(await resolveToken("this-token-does-not-exist")).toBeNull();
  });

  it("regenerateToken revokes the old token and returns a working new one", async () => {
    const org = await makeOrg();
    const issued = await issueToken({ organizationId: org.id, resourceType: "PAYMENT_LINK", resourceId: "pl_1" });

    const regenerated = await regenerateToken(issued.token);
    expect(regenerated).not.toBeNull();
    expect(regenerated!.token).not.toBe(issued.token);

    expect(await resolveToken(issued.token)).toBeNull();
    expect(await resolveToken(regenerated!.token)).toEqual({
      organizationId: org.id,
      resourceType: "PAYMENT_LINK",
      resourceId: "pl_1",
    });
  });
});
