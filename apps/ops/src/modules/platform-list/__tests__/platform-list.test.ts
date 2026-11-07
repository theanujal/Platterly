import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newId, parsePlatformProductList, requestTarget, signedHeaders, verifyRequest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { finish } from "../../../../scripts/lib/platform-reader.mjs";
import { buildProductList, handleProductListRequest, readerSecrets } from "../platform-list";
import { URL_, call, pool, provisionKnown, requireScratchDatabase, reset, rotateKnown } from "./helpers";

async function clean() {
  await prisma.product.deleteMany({ where: { key: { startsWith: "plrtest" } } });
}

// Runs only against a scratch database (see helpers.ts): it deletes the platform_reader row.
describe("platform product list (F6.1.0)", () => {
  beforeAll(async () => {
    requireScratchDatabase();
    await clean();
    await reset();
  });
  beforeEach(async () => {
    await clean();
    await reset();
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    try {
      await clean();
      await reset();
    } finally {
      await pool.end();
    }
  });

  it("answers a correctly signed request with a signed, schema-valid list", async () => {
    const sign = await provisionKnown();
    await registerProduct({ key: "plrtest", name: "Plr Test", baseUrl: "https://plrtest.example.com", actorUserId: null });
    const res = await call(sign);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(verifyRequest([sign], res.headers, text).ok).toBe(true);
    const parsed = parsePlatformProductList(JSON.parse(text));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.products).toContainEqual({ productKey: "plrtest", name: "Plr Test", baseUrl: "https://plrtest.example.com", active: true });
  });

  it("answers 401 to everyone, and creates nothing, until a secret has been provisioned", async () => {
    expect(await readerSecrets()).toBeNull();
    expect((await call(null)).status).toBe(401);
    expect((await call("opssec_anything")).status).toBe(401);
    expect(await prisma.platformReader.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: { startsWith: "platform_reader." } } })).toBe(0);
  });

  it("HMAC: refuses unauthenticated, wrong-secret, tampered-route, tampered-query and wrong-method requests", async () => {
    const sign = await provisionKnown();
    expect((await call(null)).status).toBe(401);
    expect((await call("opssec_wrong")).status).toBe(401);
    expect((await call(sign, { tamperTarget: "https://ops.example.com/api/platform/other" })).status).toBe(401);
    expect((await call(sign, { url: `${URL_}?x=1`, tamperTarget: URL_ })).status).toBe(401);
    // Signed as a GET but sent as a POST: the method is part of what was signed.
    expect((await call(sign, { method: "POST" })).status).toBe(401);
    // A v1 (unbound) signature is not accepted on this route.
    const v1 = signedHeaders(sign, newId("command"), "");
    expect((await handleProductListRequest(new Request(URL_, { headers: v1 }))).status).toBe(401);
  });

  it("HMAC: refuses a request with any one required header missing, and a malformed timestamp", async () => {
    const sign = await provisionKnown();
    for (const drop of ["x-platterly-signature", "x-platterly-timestamp", "x-platterly-event-id"]) expect((await call(sign, { drop })).status, drop).toBe(401);
    for (const bad of ["abc", "12", "1.5e9", "-1700000000", " 1700000000"]) expect((await call(sign, { headers: { "x-platterly-timestamp": bad } })).status, bad).toBe(401);
  });

  it("timestamps: accepts inside 300 s on both sides, refuses outside it in both directions", async () => {
    const sign = await provisionKnown();
    const now = Math.floor(Date.now() / 1000);
    expect((await call(sign, { now: now - 295 })).status).toBe(200);
    expect((await call(sign, { now: now + 295 })).status).toBe(200);
    expect((await call(sign, { now: now - 305 })).status).toBe(401);
    expect((await call(sign, { now: now + 305 })).status).toBe(401);
  });

  it("replay: the same signed request sent again inside the window is answered the same way and changes nothing", async () => {
    const sign = await provisionKnown();
    await registerProduct({ key: "plrtest", name: "Plr Test", baseUrl: "https://plrtest.example.com", actorUserId: null });
    const headers = signedHeaders(sign, newId("command"), "", { target: requestTarget("GET", URL_) });
    const send = () => handleProductListRequest(new Request(URL_, { headers }));
    const first = await send();
    expect(first.status).toBe(200);
    const before = await prisma.platformReader.findUniqueOrThrow({ where: { id: "default" } });
    const auditBefore = await prisma.auditLog.count();
    const bodies: string[] = [];
    for (let i = 0; i < 3; i++) {
      const again = await send();
      expect(again.status).toBe(200);
      bodies.push(JSON.parse(await again.text()).listVersion);
    }
    const after = await prisma.platformReader.findUniqueOrThrow({ where: { id: "default" } });
    expect(new Set(bodies).size).toBe(1);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.listVersion).toBe(before.listVersion);
    expect(after.secret).toBe(before.secret);
    expect(await prisma.auditLog.count()).toBe(auditBefore);
  });

  it("does not accept a product's own command secret", async () => {
    await provisionKnown();
    const { secrets } = await registerProduct({ key: "plrtest", name: "Plr Test", baseUrl: "https://plrtest.example.com", actorUserId: null });
    expect((await call(secrets.inbound)).status).toBe(401);
    expect((await call(secrets.outbound)).status).toBe(401);
  });

  it("refuses a contract version it does not support, only after authentication", async () => {
    const sign = await provisionKnown();
    expect((await call(sign, { headers: { "x-platterly-contract": "999" } })).status).toBe(400);
    expect((await call("opssec_wrong", { headers: { "x-platterly-contract": "999" } })).status).toBe(401);
  });

  it("a tampered answer fails verification and a bad list fails the schema", async () => {
    const sign = await provisionKnown();
    const res = await call(sign);
    const text = await res.text();
    expect(verifyRequest([sign], res.headers, text.replace('"products":[', '"products":[{"productKey":"evil","name":"x","baseUrl":"https://evil.example.com","active":true},'))).toMatchObject({ ok: false, reason: "bad_signature" });
    const good = JSON.parse(text);
    expect(parsePlatformProductList({ ...good, listVersion: -1 }).ok).toBe(false);
    expect(parsePlatformProductList({ ...good, products: [{ productKey: "a", name: "A", baseUrl: "https://x.example.com/path", active: true }] }).ok).toBe(false);
    expect(parsePlatformProductList({ ...good, products: [{ productKey: "ab", name: "A", baseUrl: "https://x.example.com", active: "yes" }] }).ok).toBe(false);
    expect(parsePlatformProductList("nope").ok).toBe(false);
  });

  it("listVersion goes up only when the list changes", async () => {
    await provisionKnown();
    const first = await buildProductList();
    expect((await buildProductList()).listVersion).toBe(first.listVersion);
    await registerProduct({ key: "plrtest", name: "Plr Test", baseUrl: "https://plrtest.example.com", actorUserId: null });
    const second = await buildProductList();
    expect(second.listVersion).toBe(first.listVersion + 1);
    await prisma.product.update({ where: { key: "plrtest" }, data: { status: "DISABLED" } });
    const third = await buildProductList();
    expect(third.listVersion).toBe(second.listVersion + 1);
    expect(third.products.find((p) => p.productKey === "plrtest")?.active).toBe(false);
  });

  it("carries no secrets, plans or prices", async () => {
    await provisionKnown();
    await registerProduct({ key: "plrtest", name: "Plr Test", baseUrl: "https://plrtest.example.com", actorUserId: null });
    const list = await buildProductList();
    for (const p of list.products) expect(Object.keys(p).sort()).toEqual(["active", "baseUrl", "name", "productKey"]);
    expect(JSON.stringify(list)).not.toMatch(/secret|opssec_|price|plan/i);
  });

  it("accepts the old and the new secret during a rotation, and only the new one after it is finished", async () => {
    const oldSecret = await provisionKnown();
    const newSecret = await rotateKnown();
    expect(newSecret).not.toBe(oldSecret);
    expect((await call(oldSecret)).status).toBe(200);
    const res = await call(newSecret);
    expect(res.status).toBe(200);
    expect(verifyRequest([newSecret], res.headers, await res.text()).ok).toBe(true);
    await finish(pool);
    expect((await call(oldSecret)).status).toBe(401);
    expect((await call(newSecret)).status).toBe(200);
  });

  it("stores the secret encrypted, and never the plaintext, anywhere in the database row", async () => {
    const sign = await provisionKnown();
    const row = await prisma.platformReader.findUniqueOrThrow({ where: { id: "default" } });
    expect(row.secret.startsWith("v1.")).toBe(true);
    expect(JSON.stringify(row)).not.toContain(sign);
  });

  describe("HTTPS only", () => {
    it("in production refuses a request that did not come through the proxy over https, including one with no header at all", async () => {
      const sign = await provisionKnown();
      vi.stubEnv("NODE_ENV", "production");
      expect((await call(sign)).status).toBe(401);
      expect((await call(sign, { headers: { "x-forwarded-proto": "http" } })).status).toBe(401);
      expect((await call(sign, { headers: { "x-forwarded-proto": "HTTPS " } })).status).toBe(401);
      expect((await call(sign, { url: "http://ops.example.com/api/platform/products" })).status).toBe(401);
    });

    it("in production accepts a correctly signed request that came through the proxy over https", async () => {
      const sign = await provisionKnown();
      vi.stubEnv("NODE_ENV", "production");
      expect((await call(sign, { headers: { "x-forwarded-proto": "https" } })).status).toBe(200);
    });

    it("outside production (local development over http) the proxy header is not required", async () => {
      const sign = await provisionKnown();
      vi.stubEnv("NODE_ENV", "development");
      expect((await call(sign, { url: "http://ops.localhost:3200/api/platform/products" })).status).toBe(200);
    });
  });
});
