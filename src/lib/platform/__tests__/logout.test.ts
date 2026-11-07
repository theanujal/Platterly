import { BACKCHANNEL_LOGOUT_EVENT } from "@platterly/platform-contract";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { PLATFORM_CLIENT_ID, PLATFORM_PROVIDER_ID, platformIssuer, safeNextPath } from "../config";
import { handlePlatformLogout } from "../logout";

// F8.1.3: Caterly's back-channel logout endpoint against the real dev database (the suite's convention), with a generated key standing in for the
// identity provider's signing key. Every row is created and removed by exact id.
const RUN = `bcl${Date.now().toString(36)}`;
const NOW = new Date();
const nowS = Math.floor(NOW.getTime() / 1000);

describe("safeNextPath", () => {
  it("keeps a path on this site and refuses anything else", () => {
    expect(safeNextPath("/invitations/abc/accept")).toBe("/invitations/abc/accept");
    for (const bad of ["https://evil.test", "//evil.test", "javascript:alert(1)", "\\evil", "", null, undefined, "evil"]) expect(safeNextPath(bad as string)).toBe("/dashboard");
    expect(safeNextPath("//evil.test", "/")).toBe("/");
  });
});

describe("Platterly back-channel logout (F8.1.3)", () => {
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
  let key: ReturnType<typeof createLocalJWKSet>;
  const userIds: string[] = [];
  let n = 0;

  beforeAll(async () => {
    const pair = await generateKeyPair("EdDSA", { extractable: true });
    privateKey = pair.privateKey;
    key = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "EdDSA" }] });
  });
  afterEach(async () => {
    await prisma.verification.deleteMany({ where: { identifier: { startsWith: `platform-logout-jti:${RUN}` } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } }); // cascades to account and session
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** A Caterly user linked to the central subject `sub`, with `sessions` live sessions. */
  async function person(sessions: number, linked = true) {
    const id = `${RUN}u${n++}`;
    userIds.push(id);
    await prisma.user.create({ data: { id, name: "Test", email: `${id}@kitchen.test`, emailVerified: true } });
    if (linked) await prisma.account.create({ data: { id: `${id}a`, accountId: id, providerId: PLATFORM_PROVIDER_ID, userId: id } });
    for (let i = 0; i < sessions; i++) await prisma.session.create({ data: { id: `${id}s${i}`, token: `${id}t${i}`, userId: id, expiresAt: new Date(Date.now() + 3_600_000) } });
    return id;
  }
  const liveSessions = (id: string) => prisma.session.count({ where: { userId: id } });

  async function token(patch: Record<string, unknown> = {}, o: { aud?: string; iss?: string; exp?: number; typ?: string | null; signWith?: typeof privateKey } = {}) {
    const payload: Record<string, unknown> = { sub: "x", sid: "central-sid", jti: `${RUN}j${n++}`, events: { [BACKCHANNEL_LOGOUT_EVENT]: {} }, ...patch };
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];
    return new SignJWT(payload)
      .setProtectedHeader({ alg: "EdDSA", kid: "k1", ...(o.typ === null ? {} : { typ: o.typ ?? "logout+jwt" }) })
      .setIssuer(o.iss ?? platformIssuer())
      .setAudience(o.aud ?? PLATFORM_CLIENT_ID)
      .setIssuedAt(nowS - 5)
      .setExpirationTime(o.exp ?? nowS + 120)
      .sign(o.signWith ?? privateKey);
  }
  const post = (t: string) => handlePlatformLogout({ db: prisma, body: new URLSearchParams({ logout_token: t }).toString(), key, now: NOW });

  it("ends every session of the Caterly user linked to the central subject, and nobody else's", async () => {
    const a = await person(2);
    const other = await person(1);
    expect(await post(await token({ sub: a }))).toEqual({ status: 200, ended: 2 });
    expect(await liveSessions(a)).toBe(0);
    expect(await liveSessions(other)).toBe(1);
  });

  it("matches by the linked account, never by email: a Caterly user that merely shares the subject text as its id but is not linked is untouched", async () => {
    const unlinked = await person(1, false);
    expect(await post(await token({ sub: unlinked }))).toEqual({ status: 200, ended: 0 });
    expect(await liveSessions(unlinked)).toBe(1);
  });

  it("answers 200 with nothing ended for a subject Caterly does not know, and for a token naming only a session", async () => {
    expect(await post(await token({ sub: "nobody-here" }))).toEqual({ status: 200, ended: 0 });
    const a = await person(1);
    expect(await post(await token({ sub: undefined }))).toEqual({ status: 200, ended: 0 });
    expect(await liveSessions(a)).toBe(1);
  });

  it("refuses a repeated token (same jti) the second time", async () => {
    const a = await person(1);
    const t = await token({ sub: a });
    expect(await post(t)).toMatchObject({ status: 200 });
    await prisma.session.create({ data: { id: `${a}s9`, token: `${a}t9`, userId: a, expiresAt: new Date(Date.now() + 3_600_000) } });
    expect(await post(t)).toEqual({ status: 400, error: "replayed" });
    expect(await liveSessions(a)).toBe(1);
  });

  it("refuses a forged or wrong token and ends nothing: wrong key, audience, issuer, expiry, type, no event, a nonce, garbage, or no token", async () => {
    const a = await person(1);
    const other = await generateKeyPair("EdDSA");
    const bad = [
      await token({ sub: a }, { signWith: other.privateKey }),
      await token({ sub: a }, { aud: "another-product" }),
      await token({ sub: a }, { iss: "https://evil.test" }),
      await token({ sub: a }, { exp: nowS - 600 }),
      await token({ sub: a }, { typ: null }),
      await token({ sub: a, events: {} }),
      await token({ sub: a, nonce: "n" }),
      "garbage",
    ];
    for (const t of bad) expect(await post(t), t.slice(0, 16)).toEqual({ status: 400, error: "invalid_token" });
    expect(await handlePlatformLogout({ db: prisma, body: "", key, now: NOW })).toEqual({ status: 400, error: "invalid_request" });
    expect(await liveSessions(a)).toBe(1);
  });
});
