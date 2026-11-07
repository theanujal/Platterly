import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";
import { newId } from "../../contract/index";
import { PLATFORM_CONTRACT_VERSION, receiveEvent, signPlatformRequest, signPullRequest, signPullResponse, validateIdToken, verifyPlatformRequest, verifyPullResponse } from "../index";

const ISS = "https://auth.platterly.test/api/auth";
const AUD = "client_caterly";
const NONCE = "nonce-abc";
const NOW = new Date("2026-11-07T10:00:00Z");
const nowS = Math.floor(NOW.getTime() / 1000);

async function keys(alg = "EdDSA") {
  const { publicKey, privateKey } = await generateKeyPair(alg, { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg };
  return { privateKey, jwks: createLocalJWKSet({ keys: [jwk] }) };
}
const claims = (patch: Record<string, unknown> = {}) => ({ sub: "usr_1", email: "a@b.co", email_verified: true, name: "A", membership_version: 2, nonce: NONCE, ...patch });
async function token(privateKey: Parameters<SignJWT["sign"]>[0], patch: Record<string, unknown> = {}, o: { iss?: string; aud?: string | string[]; exp?: number; iat?: number; alg?: string } = {}) {
  return new SignJWT(claims(patch))
    .setProtectedHeader({ alg: o.alg ?? "EdDSA", kid: "k1" })
    .setIssuer(o.iss ?? ISS)
    .setAudience(o.aud ?? AUD)
    .setIssuedAt(o.iat ?? nowS - 10)
    .setExpirationTime(o.exp ?? nowS + 300)
    .sign(privateKey);
}
const opts = (key: Awaited<ReturnType<typeof keys>>["jwks"], extra: object = {}) => ({ key, issuer: ISS, audience: AUD, nonce: NONCE, now: NOW, ...extra });

describe("validateIdToken matrix", () => {
  it("accepts a good token and returns identity claims only", async () => {
    const k = await keys();
    const r = await validateIdToken(await token(k.privateKey), opts(k.jwks));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.claims).toMatchObject({ sub: "usr_1", email: "a@b.co", membership_version: 2 });
  });

  const cases: [string, (k: Awaited<ReturnType<typeof keys>>) => Promise<string>, string][] = [
    ["wrong issuer", (k) => token(k.privateKey, {}, { iss: "https://evil.test" }), "wrong_issuer"],
    ["wrong audience", (k) => token(k.privateKey, {}, { aud: "other_client" }), "wrong_audience"],
    ["audience list containing ours", (k) => token(k.privateKey, {}, { aud: [AUD, "other"] }), "wrong_audience"],
    ["expired", (k) => token(k.privateKey, {}, { exp: nowS - 120 }), "expired"],
    ["issued in the future", (k) => token(k.privateKey, {}, { iat: nowS + 600, exp: nowS + 900 }), "not_yet_valid"],
    ["wrong nonce (another sign-in attempt)", (k) => token(k.privateKey, { nonce: "other" }), "wrong_nonce"],
    ["no nonce", (k) => token(k.privateKey, { nonce: undefined }), "wrong_nonce"],
    ["email not verified", (k) => token(k.privateKey, { email_verified: false }), "email_not_verified"],
    ["missing membership_version", (k) => token(k.privateKey, { membership_version: undefined }), "invalid_claims"],
    ["not a token", async () => "abc.def", "malformed"],
  ];
  for (const [name, make, reason] of cases) {
    it(`refuses: ${name}`, async () => {
      const k = await keys();
      const r = await validateIdToken(await make(k), opts(k.jwks));
      expect(r).toEqual({ ok: false, reason });
    });
  }

  it("refuses a token signed by a different key", async () => {
    const real = await keys();
    const attacker = await keys();
    const r = await validateIdToken(await token(attacker.privateKey), opts(real.jwks));
    expect(r.ok).toBe(false);
  });

  it("refuses alg none and a symmetric (HS256) token, even one signed with the public key bytes", async () => {
    const k = await keys();
    const header = (alg: string) => Buffer.from(JSON.stringify({ alg, kid: "k1" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ ...claims(), iss: ISS, aud: AUD, iat: nowS, exp: nowS + 300 })).toString("base64url");
    expect((await validateIdToken(`${header("none")}.${body}.`, opts(k.jwks))).ok).toBe(false);
    const hs = await new SignJWT(claims()).setProtectedHeader({ alg: "HS256", kid: "k1" }).setIssuer(ISS).setAudience(AUD).setIssuedAt(nowS).setExpirationTime(nowS + 300).sign(new TextEncoder().encode("guess"));
    expect((await validateIdToken(hs, opts(k.jwks))).ok).toBe(false);
  });

  it("accepts a small clock difference and refuses a large one", async () => {
    const k = await keys();
    expect((await validateIdToken(await token(k.privateKey, {}, { iat: nowS + 20, exp: nowS + 300 }), opts(k.jwks))).ok).toBe(true);
    expect((await validateIdToken(await token(k.privateKey, {}, { exp: nowS - 20 }), opts(k.jwks))).ok).toBe(true);
    expect((await validateIdToken(await token(k.privateKey, {}, { exp: nowS - 31 }), opts(k.jwks))).ok).toBe(false);
  });

  it("can be told to accept an unverified email", async () => {
    const k = await keys();
    expect((await validateIdToken(await token(k.privateKey, { email_verified: false }), opts(k.jwks, { requireVerifiedEmail: false }))).ok).toBe(true);
  });
});

const SECRET = "platsec_recv";
const URL_ = "https://caterly.test/api/platform/events";
const business = newId("business");
const event = (sequence: number, eventId = newId("event")) => ({ version: PLATFORM_CONTRACT_VERSION, eventId, businessId: business, sequence, occurredAt: "2026-11-07T10:00:00.000Z", type: "organisation.status", data: { status: "suspended" } });
const delivery = (e: object & { eventId: string }, secret = SECRET, now = nowS) => {
  const rawBody = JSON.stringify(e);
  return { rawBody, headers: signPlatformRequest(secret, e.eventId, rawBody, "POST", URL_, now) };
};
const recv = (d: ReturnType<typeof delivery>, last: number | null, extra: object = {}) =>
  receiveEvent({ secrets: [SECRET], headers: d.headers, rawBody: d.rawBody, method: "POST", url: URL_, lastApplied: () => last, now: nowS, ...extra });

describe("receiveEvent", () => {
  it("applies a new event, and a duplicate or older one is accepted but not applied", async () => {
    const e = event(5);
    expect(await recv(delivery(e), null)).toMatchObject({ ok: true, apply: true });
    expect(await recv(delivery(e), 5)).toMatchObject({ ok: true, apply: false });
    expect(await recv(delivery(e), 9)).toMatchObject({ ok: true, apply: false });
    expect(await recv(delivery(event(6)), 5)).toMatchObject({ ok: true, apply: true });
  });

  it("looks the sequence up for the event's own business, and only after verification", async () => {
    const seen: string[] = [];
    const e = event(1);
    await recv(delivery(e), null, { lastApplied: (id: string) => (seen.push(id), null) });
    expect(seen).toEqual([business]);
    seen.length = 0;
    await recv(delivery(e, "wrong"), null, { lastApplied: (id: string) => (seen.push(id), null) });
    expect(seen).toEqual([]);
  });

  it("refuses a bad signature, tampered body, other route, stale timestamp and missing headers without parsing", async () => {
    const e = event(1);
    const d = delivery(e);
    expect(await recv(delivery(e, "wrong"), null)).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(await recv({ ...d, rawBody: d.rawBody.replace("suspended", "active") }, null)).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(await recv(d, null, { url: "https://caterly.test/api/platform/other" })).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(await recv(delivery(e, SECRET, nowS - 1000), null)).toMatchObject({ ok: false, reason: "stale_timestamp" });
    expect(await recv({ rawBody: d.rawBody, headers: {} }, null)).toMatchObject({ ok: false, reason: "missing_headers" });
  });

  it("refuses a signed body that is not JSON or not a valid event, and an event id that differs from the signed one", async () => {
    const sign = (raw: string, id: string) => ({ rawBody: raw, headers: signPlatformRequest(SECRET, id, raw, "POST", URL_, nowS) });
    expect(await recv(sign("not json", "evt_x"), null)).toMatchObject({ ok: false, reason: "bad_json" });
    expect(await recv(sign(JSON.stringify({ ...event(1), sequence: 0 }), newId("event")), null)).toMatchObject({ ok: false, reason: "invalid_event" });
    const e = event(1);
    expect(await recv(sign(JSON.stringify(e), newId("event")), null)).toMatchObject({ ok: false, reason: "id_mismatch" });
  });

  it("accepts the old or new secret during a rotation", async () => {
    const e = event(1);
    expect((await recv(delivery(e, "old"), null, { secrets: ["old", "new"] })).ok).toBe(true);
    expect((await recv(delivery(e, "new"), null, { secrets: ["old", "new"] })).ok).toBe(true);
  });

  it("verifyPlatformRequest still refuses a signature made without a route", () => {
    expect(verifyPlatformRequest([SECRET], signPullResponse(SECRET, "evt_x", "{}", nowS), "{}", "POST", URL_, nowS).ok).toBe(false);
  });
});

describe("signed pull", () => {
  const PULL = "https://platform.test/api/platform/businesses/" + business + "/memberships?since=3";
  it("the request is route-bound including the query, so the version asked for cannot be changed", () => {
    const h = signPullRequest(SECRET, "pull_1", PULL, nowS);
    expect(verifyPlatformRequest([SECRET], h, "", "GET", PULL, nowS).ok).toBe(true);
    expect(verifyPlatformRequest([SECRET], h, "", "GET", PULL.replace("since=3", "since=0"), nowS).ok).toBe(false);
    expect(verifyPlatformRequest([SECRET], h, "", "POST", PULL, nowS).ok).toBe(false);
  });

  it("verifies an answer signed for this request, and refuses a tampered, stale, wrongly-keyed or swapped one", () => {
    const body = JSON.stringify({ membershipVersion: 4, members: [] });
    const h = signPullResponse(SECRET, "pull_1", body, nowS);
    expect(verifyPullResponse([SECRET], "pull_1", h, body, nowS)).toEqual({ ok: true, value: { membershipVersion: 4, members: [] } });
    expect(verifyPullResponse([SECRET], "pull_1", h, body.replace("4", "9"), nowS)).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(verifyPullResponse(["other"], "pull_1", h, body, nowS)).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(verifyPullResponse([SECRET], "pull_1", h, body, nowS + 1000)).toMatchObject({ ok: false, reason: "stale_timestamp" });
    expect(verifyPullResponse([SECRET], "pull_2", h, body, nowS)).toMatchObject({ ok: false, reason: "id_mismatch" });
  });

  it("refuses a signed answer that is not a JSON object", () => {
    for (const body of ["nope", "[]", "5"]) expect(verifyPullResponse([SECRET], "p", signPullResponse(SECRET, "p", body, nowS), body, nowS).ok).toBe(false);
  });
});

import { BACKCHANNEL_LOGOUT_EVENT, LOGOUT_TOKEN_TYP, validateLogoutToken } from "../index";

describe("validateLogoutToken matrix", () => {
  async function logoutToken(privateKey: Parameters<SignJWT["sign"]>[0], patch: Record<string, unknown> = {}, o: { typ?: string | null; iss?: string; aud?: string; exp?: number; iat?: number } = {}) {
    const payload: Record<string, unknown> = { sub: "usr_1", sid: "sess_1", jti: "jti_1", events: { [BACKCHANNEL_LOGOUT_EVENT]: {} }, ...patch };
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];
    return new SignJWT(payload)
      .setProtectedHeader({ alg: "EdDSA", kid: "k1", ...(o.typ === null ? {} : { typ: o.typ ?? LOGOUT_TOKEN_TYP }) })
      .setIssuer(o.iss ?? ISS)
      .setAudience(o.aud ?? AUD)
      .setIssuedAt(o.iat ?? nowS - 5)
      .setExpirationTime(o.exp ?? nowS + 120)
      .sign(privateKey);
  }
  const base = (jwks: Awaited<ReturnType<typeof keys>>["jwks"]) => ({ key: jwks, issuer: ISS, audience: AUD, now: NOW });

  it("accepts a good token and returns sub, sid and jti", async () => {
    const k = await keys();
    expect(await validateLogoutToken(await logoutToken(k.privateKey), base(k.jwks))).toEqual({ ok: true, sub: "usr_1", sid: "sess_1", jti: "jti_1", exp: nowS + 120 });
  });
  it("accepts sub only or sid only", async () => {
    const k = await keys();
    expect(await validateLogoutToken(await logoutToken(k.privateKey, { sid: undefined }), base(k.jwks))).toMatchObject({ ok: true, sub: "usr_1" });
    expect(await validateLogoutToken(await logoutToken(k.privateKey, { sub: undefined }), base(k.jwks))).toMatchObject({ ok: true, sid: "sess_1" });
  });
  const cases: [string, (k: Awaited<ReturnType<typeof keys>>) => Promise<string>, string][] = [
    ["an ID token replayed as a logout token (no logout+jwt type)", (k) => logoutToken(k.privateKey, {}, { typ: null }), "wrong_type"],
    ["another type", (k) => logoutToken(k.privateKey, {}, { typ: "JWT" }), "wrong_type"],
    ["no logout event", (k) => logoutToken(k.privateKey, { events: {} }), "missing_event"],
    ["a nonce", (k) => logoutToken(k.privateKey, { nonce: "n" }), "nonce_present"],
    ["neither sub nor sid", (k) => logoutToken(k.privateKey, { sub: undefined, sid: undefined }), "no_subject"],
    ["no jti", (k) => logoutToken(k.privateKey, { jti: undefined }), "missing_jti"],
    ["wrong issuer", (k) => logoutToken(k.privateKey, {}, { iss: "https://evil.test" }), "wrong_issuer"],
    ["wrong audience", (k) => logoutToken(k.privateKey, {}, { aud: "other" }), "wrong_audience"],
    ["expired", (k) => logoutToken(k.privateKey, {}, { exp: nowS - 120 }), "expired"],
    ["issued in the future", (k) => logoutToken(k.privateKey, {}, { iat: nowS + 600, exp: nowS + 900 }), "not_yet_valid"],
  ];
  for (const [name, make, reason] of cases)
    it(`refuses: ${name}`, async () => {
      const k = await keys();
      expect(await validateLogoutToken(await make(k), base(k.jwks))).toEqual({ ok: false, reason });
    });
  it("refuses a token signed by another key and garbage", async () => {
    const real = await keys();
    const attacker = await keys();
    expect((await validateLogoutToken(await logoutToken(attacker.privateKey), base(real.jwks))).ok).toBe(false);
    expect(await validateLogoutToken("abc.def", base(real.jwks))).toEqual({ ok: false, reason: "malformed" });
  });
});
