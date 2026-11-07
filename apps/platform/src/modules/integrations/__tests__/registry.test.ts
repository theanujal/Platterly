import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { decryptSecret, encryptSecret } from "../secret-box";
import { IntegrationInputError, getIntegration, getSecrets, normaliseBaseUrl, registerIntegration, retirePreviousSecret, rotateSecret } from "../registry";

const actor = { kind: "staff", ref: "test" } as const;

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-for-registry";
});

describe("secret box", () => {
  it("round-trips and refuses a tampered value", () => {
    const stored = encryptSecret("hello");
    expect(stored).not.toContain("hello");
    expect(decryptSecret(stored)).toBe("hello");
    expect(() => decryptSecret(stored.slice(0, -2) + "xx")).toThrow();
    expect(() => decryptSecret("garbage")).toThrow("Unreadable");
  });
  it("refuses to run in production without its own key, even when AUTH_SECRET is set", () => {
    const env = process.env as Record<string, string | undefined>;
    const before = { node: env.NODE_ENV, key: env.PLATFORM_SECRETS_KEY };
    try {
      env.NODE_ENV = "production";
      delete env.PLATFORM_SECRETS_KEY;
      expect(() => encryptSecret("x")).toThrow("PLATFORM_SECRETS_KEY");
      env.PLATFORM_SECRETS_KEY = "a-dedicated-key";
      expect(decryptSecret(encryptSecret("x"))).toBe("x");
    } finally {
      env.NODE_ENV = before.node;
      if (before.key === undefined) delete env.PLATFORM_SECRETS_KEY;
      else env.PLATFORM_SECRETS_KEY = before.key;
    }
  });
});

describe("normaliseBaseUrl", () => {
  it("accepts https and local http, drops the trailing slash", () => {
    expect(normaliseBaseUrl("https://catering.platterly.in/")).toBe("https://catering.platterly.in");
    expect(normaliseBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normaliseBaseUrl("http://app.localhost:3300/")).toBe("http://app.localhost:3300");
  });
  it.each(["http://example.com", "ftp://example.com", "not a url", "https://u:p@example.com", "https://example.com/?a=1", "https://example.com/#x"])("refuses %s", (bad) => {
    expect(() => normaliseBaseUrl(bad)).toThrow(IntegrationInputError);
  });
});

// Against the real dev database. Everything runs inside one transaction that is rolled back on purpose, so nothing persists (audit rows can never be deleted).
class Rollback extends Error {}
describe.skipIf(!process.env.DATABASE_URL)("registry against the real database", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
  const inRollback = async (fn: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<void>) => {
    await expect(prisma.$transaction(async (tx) => { await fn(tx); throw new Rollback(); })).rejects.toBeInstanceOf(Rollback);
  };
  const KEY = "regtest";

  it("registers once, stores secrets encrypted, audits without secrets, and a repeat does nothing", async () => {
    await inRollback(async (tx) => {
      const made = await registerIntegration(tx, actor, { key: KEY, name: "Reg Test", baseUrl: "http://localhost:3000/" });
      expect(made).not.toBeNull();
      const raw = await tx.productIntegration.findUniqueOrThrow({ where: { key: KEY } });
      expect(JSON.stringify(raw)).not.toContain(made!.outbound);
      expect(await getIntegration(tx, KEY)).toEqual({ key: KEY, name: "Reg Test", baseUrl: "http://localhost:3000", status: "current" });
      expect((await getSecrets(tx, KEY, "outbound"))?.current).toBe(made!.outbound);
      expect((await getSecrets(tx, KEY, "inbound"))?.current).toBe(made!.inbound);
      expect(await registerIntegration(tx, actor, { key: KEY, name: "x", baseUrl: "http://localhost:1" })).toBeNull();
      const audits = await tx.auditLog.findMany({ where: { subjectId: KEY } });
      expect(audits.map((a) => a.action)).toEqual(["product_integration.registered"]);
      expect(JSON.stringify(audits)).not.toContain("plsec_");
    });
  });

  it("rotates one direction, keeps the old secret valid until retired, and audits each step", async () => {
    await inRollback(async (tx) => {
      const made = (await registerIntegration(tx, actor, { key: KEY, name: "Reg Test", baseUrl: "http://localhost:3000" }))!;
      const fresh = (await rotateSecret(tx, actor, KEY, "outbound"))!;
      expect(await getSecrets(tx, KEY, "outbound")).toEqual({ current: fresh, previous: made.outbound });
      expect(await getSecrets(tx, KEY, "inbound")).toEqual({ current: made.inbound, previous: null });
      expect(await retirePreviousSecret(tx, actor, KEY, "outbound")).toBe(true);
      expect((await getSecrets(tx, KEY, "outbound"))?.previous).toBeNull();
      const audits = await tx.auditLog.findMany({ where: { subjectId: KEY } });
      expect(audits.map((a) => a.action).sort()).toEqual(["product_integration.registered", "product_integration.secret_retired", "product_integration.secret_rotated"]);
      expect(JSON.stringify(audits)).not.toContain("plsec_");
    });
  });

  it("answers null/false for an unknown product and refuses a bad status value", async () => {
    await inRollback(async (tx) => {
      expect(await getSecrets(tx, "nope", "outbound")).toBeNull();
      expect(await rotateSecret(tx, actor, "nope", "inbound")).toBeNull();
      expect(await retirePreviousSecret(tx, actor, "nope", "inbound")).toBe(false);
    });
    await expect(prisma.$executeRaw`INSERT INTO product_integrations (key, name, base_url, status, outbound_secret, inbound_secret) VALUES ('badstatus', 'x', 'http://localhost', 'weird', 'a', 'b')`).rejects.toThrow();
  });
});
