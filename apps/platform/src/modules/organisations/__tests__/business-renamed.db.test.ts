import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newId, verifyRequest } from "@platterly/contract";
import { signPlatformRequest } from "@platterly/platform-contract";
import { prisma } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";
import { registerIntegration } from "../../integrations/registry";
import { receiveBusinessCreated } from "../business-created";
import { receiveBusinessRenamed } from "../business-renamed";

// The rename receiver against the dev database. Every scenario runs in ONE outer transaction that is rolled back (the audit table cannot have rows deleted).
const enabled = Boolean(process.env.DATABASE_URL && (process.env.PLATFORM_SECRETS_KEY || process.env.AUTH_SECRET));
class Rollback extends Error {}
type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
const CREATED_URL = "http://auth.localhost:3300/api/products/business-created";
const URL_ = "http://auth.localhost:3300/api/products/business-renamed";

async function scenario(fn: (t: Tx) => Promise<void>) {
  const err = await prisma.$transaction(async (tx) => { await fn(tx); throw new Rollback(); }, { timeout: 30_000 }).catch((e: unknown) => e);
  if (!(err instanceof Rollback)) throw err;
}

/** A product with a business already created through the real "created" receiver, so it is linked the way production is. */
async function setup(tx: Tx) {
  const productKey = `br${randomBytes(4).toString("hex")}`;
  const secrets = (await registerIntegration(tx, { kind: "system", ref: "test" }, { key: productKey, name: "Test product", baseUrl: "http://brtest.localhost:3500" }))!;
  const shim = new Proxy(tx, { get: (target, prop) => (prop === "$transaction" ? (fn: (t: Tx) => unknown) => fn(tx) : (target as never)[prop]) }) as unknown as PrismaClient;
  const subject = `sub-${randomUUID()}`;
  const businessId = newId("business");
  const createdBody = { version: 1, messageId: newId("command"), type: "business.created", productKey, businessId, businessName: "Unnamed Business", owner: { subject } };
  const raw = JSON.stringify(createdBody);
  await receiveBusinessCreated(
    { prisma: shim, readPerson: async () => ({ email: `br-${randomUUID()}@fixture.invalid`, emailVerified: true }), linkClient: tx as never },
    { rawBody: raw, method: "POST", url: CREATED_URL, headers: new Headers({ "content-type": "application/json", ...signPlatformRequest(secrets.inbound, createdBody.messageId, raw, "POST", CREATED_URL) }) },
  );
  const body = (over: Record<string, unknown> = {}) => ({ version: 1, messageId: newId("command"), type: "business.renamed", productKey, businessId, businessName: "Bhandary's Kitchen", nameVersion: 1000, ...over });
  const post = (b: ReturnType<typeof body>, secret = secrets.inbound) => {
    const text = JSON.stringify(b);
    return receiveBusinessRenamed({ prisma: shim }, { rawBody: text, method: "POST", url: URL_, headers: new Headers({ "content-type": "application/json", ...signPlatformRequest(secret, b.messageId as string, text, "POST", URL_) }) });
  };
  return { productKey, businessId, secrets, body, post };
}
const nameOf = async (tx: Tx, id: string) => tx.organisation.findUniqueOrThrow({ where: { id }, select: { name: true, nameVersion: true } });

describe.skipIf(!enabled)("business.renamed receiver", () => {
  it("renames the business, audits it once and signs the answer", () =>
    scenario(async (tx) => {
      const t = await setup(tx);
      const res = await t.post(t.body());
      expect(res.status).toBe(200);
      expect(await res.clone().json()).toEqual({ businessId: t.businessId, changed: true });
      expect(verifyRequest([t.secrets.inbound], res.headers, await res.clone().text()).ok).toBe(true);
      expect(await nameOf(tx, t.businessId)).toEqual({ name: "Bhandary's Kitchen", nameVersion: BigInt(1000) });
      const rows = await tx.auditLog.findMany({ where: { organisationId: t.businessId, action: "organisation.renamed" } });
      expect(rows).toHaveLength(1);
    }));

  it("answers a repeat with changed:false and writes nothing more", () =>
    scenario(async (tx) => {
      const t = await setup(tx);
      const b = t.body();
      await t.post(b);
      const again = await t.post(b);
      expect(await again.json()).toEqual({ businessId: t.businessId, changed: false });
      expect(await tx.auditLog.count({ where: { organisationId: t.businessId, action: "organisation.renamed" } })).toBe(1);
    }));

  it("ignores an older rename that arrives late, and accepts a newer one", () =>
    scenario(async (tx) => {
      const t = await setup(tx);
      await t.post(t.body({ businessName: "New Name", nameVersion: 2000 }));
      const late = await t.post(t.body({ businessName: "Old Name", nameVersion: 1500 }));
      expect(await late.json()).toEqual({ businessId: t.businessId, changed: false });
      expect((await nameOf(tx, t.businessId)).name).toBe("New Name");
      const newer = await t.post(t.body({ businessName: "Newest Name", nameVersion: 3000 }));
      expect(await newer.json()).toEqual({ businessId: t.businessId, changed: true });
      expect((await nameOf(tx, t.businessId)).name).toBe("Newest Name");
    }));

  it("refuses a bad signature, an unknown business and a business of another product", () =>
    scenario(async (tx) => {
      const t = await setup(tx);
      expect((await t.post(t.body(), randomBytes(16).toString("hex"))).status).toBe(401);
      const unknown = await t.post(t.body({ businessId: newId("business") }));
      expect(unknown.status).toBe(404);
      expect(await unknown.json()).toEqual({ error: "business_unknown" });
      // A second registered product, not linked to this business, signs a rename of it.
      const otherKey = `br${randomBytes(4).toString("hex")}`;
      const other = (await registerIntegration(tx, { kind: "system", ref: "test" }, { key: otherKey, name: "Other product", baseUrl: "http://brother.localhost:3500" }))!;
      const stolen = await t.post(t.body({ productKey: otherKey }), other.inbound);
      expect(stolen.status).toBe(403);
      expect((await nameOf(tx, t.businessId)).name).toBe("Unnamed Business");
    }));
});
