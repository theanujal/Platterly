import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newId } from "@platterly/contract";
import { parseBusinessStateSnapshot, signPullRequest, verifyPullResponse } from "@platterly/platform-contract";
import { prisma } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";
import { registerIntegration } from "../../integrations/registry";
import { receiveBusinessCreated } from "../business-created";
import { signPlatformRequest } from "@platterly/platform-contract";
import { answerStatePull } from "../business-state";

// The state pull against the dev database. Every scenario runs in ONE outer transaction that is rolled back (the audit table cannot have rows deleted).
const enabled = Boolean(process.env.DATABASE_URL && (process.env.PLATFORM_SECRETS_KEY || process.env.AUTH_SECRET));
class Rollback extends Error {}
type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
const BASE = "http://auth.localhost:3300";

async function scenario(fn: (t: Tx) => Promise<void>) {
  const err = await prisma.$transaction(async (tx) => { await fn(tx); throw new Rollback(); }, { timeout: 30_000 }).catch((e: unknown) => e);
  if (!(err instanceof Rollback)) throw err;
}

async function setup(tx: Tx) {
  const productKey = `ps${randomBytes(4).toString("hex")}`;
  const secrets = (await registerIntegration(tx, { kind: "system", ref: "test" }, { key: productKey, name: "Test product", baseUrl: "http://pstest.localhost:3500" }))!;
  const shim = new Proxy(tx, { get: (target, prop) => (prop === "$transaction" ? (fn: (t: Tx) => unknown) => fn(tx) : (target as never)[prop]) }) as unknown as PrismaClient;
  const subject = `sub-${randomUUID()}`;
  const businessId = newId("business");
  const body = { version: 1, messageId: newId("command"), type: "business.created", productKey, businessId, businessName: "Pull Kitchen", owner: { subject } };
  const raw = JSON.stringify(body);
  const createdUrl = `${BASE}/api/products/business-created`;
  await receiveBusinessCreated(
    { prisma: shim, readPerson: async () => ({ email: `ps-${randomUUID()}@fixture.invalid`, emailVerified: true }), linkClient: tx as never },
    { rawBody: raw, method: "POST", url: createdUrl, headers: new Headers({ "content-type": "application/json", ...signPlatformRequest(secrets.inbound, body.messageId, raw, "POST", createdUrl) }) },
  );
  const pull = (over: { businessId?: string; productKey?: string; secret?: string; requestId?: string; tamper?: boolean } = {}) => {
    const requestId = over.requestId ?? newId("command");
    const signedUrl = `${BASE}${"/api/products/state"}?businessId=${businessId}&productKey=${over.productKey ?? productKey}`;
    const sentUrl = over.tamper ? `${BASE}/api/products/state?businessId=${over.businessId ?? newId("business")}&productKey=${over.productKey ?? productKey}` : `${BASE}/api/products/state?businessId=${over.businessId ?? businessId}&productKey=${over.productKey ?? productKey}`;
    return { requestId, response: answerStatePull({ prisma: shim }, { method: "GET", url: sentUrl, headers: new Headers(signPullRequest(over.secret ?? secrets.inbound, requestId, signedUrl)) }) };
  };
  return { productKey, businessId, secrets, subject, pull };
}

describe.skipIf(!enabled)("business state pull", () => {
  it("answers with the business's status, sequence and members, signed with the request's own id", () =>
    scenario(async (tx) => {
      const t = await setup(tx);
      const { requestId, response } = t.pull();
      const res = await response;
      expect(res.status).toBe(200);
      const verified = verifyPullResponse([t.secrets.inbound], requestId, res.headers, await res.clone().text());
      expect(verified.ok).toBe(true);
      const snap = parseBusinessStateSnapshot(await res.json());
      expect(snap.ok).toBe(true);
      if (!snap.ok) return;
      expect(snap.value).toMatchObject({ businessId: t.businessId, status: "active" });
      expect(snap.value.members).toEqual([expect.objectContaining({ subject: t.subject, role: "admin", status: "active" })]);
      const org = await tx.organisation.findUniqueOrThrow({ where: { id: t.businessId } });
      expect([snap.value.sequence, snap.value.membershipVersion]).toEqual([Number(org.outboxSequence), Number(org.membershipVersion)]);
    }));

  it("reflects a suspended business", () =>
    scenario(async (tx) => {
      const t = await setup(tx);
      await tx.organisation.update({ where: { id: t.businessId }, data: { status: "suspended" } });
      const snap = parseBusinessStateSnapshot(await (await t.pull().response).json());
      expect(snap.ok && snap.value.status).toBe("suspended");
    }));

  it("refuses a bad signature, a request whose query was changed after signing, and a product that is unknown", () =>
    scenario(async (tx) => {
      const t = await setup(tx);
      expect((await t.pull({ secret: randomBytes(16).toString("hex") }).response).status).toBe(401);
      expect((await t.pull({ tamper: true }).response).status).toBe(401);
      expect((await t.pull({ productKey: "nobody" }).response).status).toBe(401);
    }));

  it("refuses a business that is not linked to the asking product, and one that does not exist", () =>
    scenario(async (tx) => {
      const t = await setup(tx);
      const otherKey = `ps${randomBytes(4).toString("hex")}`;
      const other = (await registerIntegration(tx, { kind: "system", ref: "test" }, { key: otherKey, name: "Other", baseUrl: "http://psother.localhost:3500" }))!;
      const shim = new Proxy(tx, { get: (target, prop) => (prop === "$transaction" ? (fn: (t: Tx) => unknown) => fn(tx) : (target as never)[prop]) }) as unknown as PrismaClient;
      const ask = async (businessId: string) => {
        const url = `${BASE}/api/products/state?businessId=${businessId}&productKey=${otherKey}`;
        return answerStatePull({ prisma: shim }, { method: "GET", url, headers: new Headers(signPullRequest(other.inbound, newId("command"), url)) });
      };
      const stolen = await ask(t.businessId);
      expect(stolen.status).toBe(403);
      expect(await stolen.json()).toEqual({ error: "not_your_business" });
    }));
});
