import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newId, verifyRequest } from "@platterly/contract";
import { signPlatformRequest } from "@platterly/platform-contract";
import { prisma } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";
import { registerIntegration } from "../../integrations/registry";
import { findUserWithIdentities } from "../../users/__tests__/fixtures";
import { receiveBusinessCreated, type IdentityPerson } from "../business-created";

// Step 4 receiver against the dev database. Every scenario runs in ONE outer transaction that is rolled back (the audit table cannot have rows deleted),
// and the handler is given a shim whose `$transaction` just runs inside it. The product, its secrets and the person are created inside it too.
const enabled = Boolean(process.env.DATABASE_URL && (process.env.PLATFORM_SECRETS_KEY || process.env.AUTH_SECRET));
class Rollback extends Error {}
type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
const URL_ = "http://auth.localhost:3300/api/products/business-created";

async function scenario(fn: (t: Tx) => Promise<void>) {
  const err = await prisma.$transaction(async (tx) => { await fn(tx); throw new Rollback(); }, { timeout: 30_000 }).catch((e: unknown) => e);
  if (!(err instanceof Rollback)) throw err;
}

async function setup(tx: Tx, person: IdentityPerson | null = { email: `bc-${randomUUID()}@fixture.invalid`, emailVerified: true }) {
  const productKey = `bc${randomBytes(4).toString("hex")}`;
  const secrets = (await registerIntegration(tx, { kind: "system", ref: "test" }, { key: productKey, name: "Test product", baseUrl: "http://bctest.localhost:3500" }))!;
  const shim = new Proxy(tx, { get: (target, prop) => (prop === "$transaction" ? (fn: (t: Tx) => unknown) => fn(tx) : (target as never)[prop]) }) as unknown as PrismaClient;
  const subject = `sub-${randomUUID()}`;
  const deps = { prisma: shim, readPerson: async (s: string) => (s === subject ? person : null), linkClient: tx as never };
  const body = (over: Record<string, unknown> = {}) => ({ version: 1, messageId: newId("command"), type: "business.created", productKey, businessId: newId("business"), businessName: "Bhandary's Kitchen", owner: { subject }, ...over });
  const post = (b: ReturnType<typeof body>, secret = secrets.inbound) => {
    const raw = JSON.stringify(b);
    return receiveBusinessCreated(deps, { rawBody: raw, method: "POST", url: URL_, headers: new Headers({ "content-type": "application/json", ...signPlatformRequest(secret, b.messageId as string, raw, "POST", URL_) }) });
  };
  return { productKey, secrets, subject, body, post, person };
}
const answerSigned = async (res: Response, secret: string) => verifyRequest([secret], res.headers, await res.clone().text()).ok;

describe.skipIf(!enabled)("business.created receiver", () => {
  it("creates the person (verified, linked by subject) and the business with them as Admin, under the product's business id, and signs the answer", () =>
    scenario(async (tx) => {
      const t = await setup(tx);
      const b = t.body();
      const res = await t.post(b);
      expect(res.status).toBe(200);
      expect(await res.clone().json()).toEqual({ businessId: b.businessId, created: true });
      expect(await answerSigned(res, t.secrets.inbound)).toBe(true);
      const user = await findUserWithIdentities(tx, t.person!.email);
      expect(user?.emailVerifiedAt).not.toBeNull();
      expect(user?.identities.map((i) => i.subject)).toEqual([t.subject]);
      const org = await tx.organisation.findUniqueOrThrow({ where: { id: b.businessId as string }, include: { members: true, products: true } });
      expect(org.name).toBe("Bhandary's Kitchen");
      expect(org.products.map((p) => p.productKey)).toEqual([t.productKey]);
      expect(org.members.map((m) => [m.userId, m.centralRole, m.status])).toEqual([[user!.id, "admin", "active"]]);
    }));

  it("answers a repeat with created:false and changes nothing", () =>
    scenario(async (tx) => {
      const t = await setup(tx);
      const b = t.body();
      await t.post(b);
      const again = await t.post({ ...b, messageId: newId("command") });
      expect(await again.clone().json()).toEqual({ businessId: b.businessId, created: false });
      expect(await tx.organisation.count({ where: { id: b.businessId as string } })).toBe(1);
    }));

  it("401 for a wrong secret, another product's secret, an unknown product and a body changed after signing", () =>
    scenario(async (tx) => {
      const t = await setup(tx);
      const other = await setup(tx);
      expect((await t.post(t.body(), "plsec_wrong")).status).toBe(401);
      expect((await t.post(t.body(), other.secrets.inbound)).status).toBe(401);
      expect((await t.post(t.body({ productKey: "nosuchproduct" }))).status).toBe(401);
      const b = t.body();
      const raw = JSON.stringify(b);
      const res = await receiveBusinessCreated({ prisma, readPerson: async () => null }, { rawBody: raw.replace("Kitchen", "Kitchen2"), method: "POST", url: URL_, headers: new Headers(signPlatformRequest(t.secrets.inbound, b.messageId as string, raw, "POST", URL_)) });
      expect(res.status).toBe(401);
      expect(await tx.organisation.count({ where: { id: b.businessId as string } })).toBe(0);
    }));

  it("400 for a message that does not parse", () =>
    scenario(async (tx) => {
      const t = await setup(tx);
      expect((await t.post(t.body({ businessId: "nope" }))).status).toBe(400);
    }));

  it("404 for a person the identity provider does not know and 422 for an unverified email, creating nothing", () =>
    scenario(async (tx) => {
      const unknown = await setup(tx, null);
      const b1 = unknown.body();
      expect((await unknown.post(b1)).status).toBe(404);
      const unverified = await setup(tx, { email: `uv-${randomUUID()}@fixture.invalid`, emailVerified: false });
      const b2 = unverified.body();
      expect((await unverified.post(b2)).status).toBe(422);
      expect(await tx.organisation.count({ where: { id: { in: [b1.businessId as string, b2.businessId as string] } } })).toBe(0);
      expect(await findUserWithIdentities(tx, unverified.person!.email)).toBeNull();
    }));

  it("409 when the product is not current", () =>
    scenario(async (tx) => {
      const t = await setup(tx);
      await tx.productIntegration.update({ where: { key: t.productKey }, data: { status: "suspended" } });
      const res = await t.post(t.body());
      expect(res.status).toBe(409);
      expect(await res.clone().json()).toEqual({ error: "product_not_current" });
    }));

  it("409 when the person is already the Admin of another business", () =>
    scenario(async (tx) => {
      const t = await setup(tx);
      expect((await t.post(t.body())).status).toBe(200);
      const second = await t.post(t.body());
      expect(second.status).toBe(409);
      expect(await second.clone().json()).toEqual({ error: "already_admin_elsewhere" });
    }));
});
