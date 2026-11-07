import { BACKCHANNEL_LOGOUT_EVENT, PLATFORM_CONTRACT_VERSION, signPlatformRequest } from "@platterly/platform-contract";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId } from "../../../../../packages/contract/index";
import { accessFor } from "../access";
import { CLIENT_ID, issuer } from "../config";
import { handleEvent } from "../events";
import { handleBackchannelLogout } from "../logout";
import { createSession, endSessionsBySid, resolveSession } from "../session";

// The stub's consumer logic against its own isolated test database (STUB_TEST_DATABASE_URL, name must contain "test"). A generated key stands in for the
// identity provider's signing key. Nothing here touches Platform, the identity database or any Caterly data.
const url = process.env.STUB_TEST_DATABASE_URL;
const SECRET = "stub-test-session-secret-".padEnd(48, "s");
const NOW = new Date("2026-11-07T10:00:00Z");
const nowS = Math.floor(NOW.getTime() / 1000);

describe.skipIf(!url)("stub product: sessions, back-channel logout, events, access", () => {
  let pool: Pool;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
  let key: ReturnType<typeof createLocalJWKSet>;

  beforeAll(async () => {
    if (!url || !/\/[^/?]*test[^/?]*(\?|$)/i.test(url)) throw new Error("these tests only run against a database named *test*");
    pool = new Pool({ connectionString: url, max: 5 });
    const pair = await generateKeyPair("EdDSA", { extractable: true });
    privateKey = pair.privateKey;
    key = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "EdDSA" }] });
  });
  afterAll(async () => {
    await pool?.end();
  });
  beforeEach(async () => {
    await pool.query("truncate stub_session, stub_logout_jti, stub_membership, stub_business, stub_business_sequence, stub_event_log");
  });

  // ---- sessions
  const signIn = (sid: string, sub: string) => createSession(pool, SECRET, { sid, sub, email: `${sub}@kitchen.test`, idToken: "idt" }, NOW);

  describe("sessions", () => {
    it("is found on every request, and not after it is ended", async () => {
      const cookie = await signIn("sid1", "usr_a");
      expect(await resolveSession(pool, SECRET, cookie, NOW)).toMatchObject({ sid: "sid1", sub: "usr_a" });
      await endSessionsBySid(pool, "sid1");
      expect(await resolveSession(pool, SECRET, cookie, NOW)).toBeNull();
    });
    it("a forged, truncated or wrongly-signed cookie, and an expired session, are refused", async () => {
      const cookie = await signIn("sid1", "usr_a");
      expect(await resolveSession(pool, SECRET, cookie.slice(0, -3), NOW)).toBeNull();
      expect(await resolveSession(pool, "another-secret".padEnd(40, "x"), cookie, NOW)).toBeNull();
      expect(await resolveSession(pool, SECRET, "not-a-uuid.sig", NOW)).toBeNull();
      expect(await resolveSession(pool, SECRET, undefined, NOW)).toBeNull();
      expect(await resolveSession(pool, SECRET, cookie, new Date(NOW.getTime() + 8 * 24 * 3600 * 1000))).toBeNull();
    });
  });

  // ---- back-channel logout
  async function logoutToken(patch: Record<string, unknown> = {}, o: { aud?: string; iss?: string; exp?: number; typ?: string | null; signWith?: typeof privateKey } = {}) {
    const payload: Record<string, unknown> = { sub: "usr_a", sid: "sid1", jti: `jti_${Math.random().toString(36).slice(2)}`, events: { [BACKCHANNEL_LOGOUT_EVENT]: {} }, ...patch };
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];
    return new SignJWT(payload)
      .setProtectedHeader({ alg: "EdDSA", kid: "k1", ...(o.typ === null ? {} : { typ: o.typ ?? "logout+jwt" }) })
      .setIssuer(o.iss ?? issuer())
      .setAudience(o.aud ?? CLIENT_ID)
      .setIssuedAt(nowS - 5)
      .setExpirationTime(o.exp ?? nowS + 120)
      .sign(o.signWith ?? privateKey);
  }
  const post = (token: string) => handleBackchannelLogout({ pool, body: new URLSearchParams({ logout_token: token }).toString(), key, now: NOW });
  const live = async (cookie: string) => (await resolveSession(pool, SECRET, cookie, NOW)) !== null;

  describe("back-channel logout", () => {
    it("a valid token naming a session ends only the sessions made from it", async () => {
      const a = await signIn("sid1", "usr_a");
      const b = await signIn("sid2", "usr_a");
      expect(await post(await logoutToken())).toEqual({ status: 200, ended: 1 });
      expect(await live(a)).toBe(false);
      expect(await live(b)).toBe(true);
    });
    it("a token naming only the person ends all of that person's sessions here, and nobody else's", async () => {
      const a = await signIn("sid1", "usr_a");
      const b = await signIn("sid2", "usr_a");
      const other = await signIn("sid3", "usr_b");
      expect(await post(await logoutToken({ sid: undefined }))).toEqual({ status: 200, ended: 2 });
      expect([await live(a), await live(b), await live(other)]).toEqual([false, false, true]);
    });
    it("answers 200 when there is nothing left to end", async () => {
      expect(await post(await logoutToken())).toEqual({ status: 200, ended: 0 });
    });
    it("refuses a replayed token (same jti) the second time", async () => {
      const cookie = await signIn("sid1", "usr_a");
      const token = await logoutToken({ jti: "once" });
      expect(await post(token)).toMatchObject({ status: 200 });
      await signIn("sid1", "usr_a");
      expect(await post(token)).toEqual({ status: 400, error: "replayed" });
      expect(await live(cookie)).toBe(false);
    });
    it("refuses a forged or wrong token and ends nothing: wrong key, audience, issuer, expiry, type, missing event, nonce, and no token", async () => {
      const cookie = await signIn("sid1", "usr_a");
      const other = await generateKeyPair("EdDSA");
      const bad = [
        await logoutToken({}, { signWith: other.privateKey }),
        await logoutToken({}, { aud: "some-other-product" }),
        await logoutToken({}, { iss: "https://evil.test" }),
        await logoutToken({}, { exp: nowS - 600 }),
        await logoutToken({}, { typ: null }),
        await logoutToken({ events: {} }),
        await logoutToken({ nonce: "n" }),
        "garbage",
      ];
      for (const token of bad) expect(await post(token), token.slice(0, 20)).toEqual({ status: 400, error: "invalid_token" });
      expect(await handleBackchannelLogout({ pool, body: "", key, now: NOW })).toEqual({ status: 400, error: "invalid_request" });
      expect(await live(cookie)).toBe(true);
    });
  });

  // ---- events
  const SECRETS = ["stub-event-secret-one"];
  const URL_ = "http://stub.localhost:3500/api/platform/events";
  const business = newId("business");
  const base = (sequence: number) => ({ version: PLATFORM_CONTRACT_VERSION, eventId: newId("event"), businessId: business, sequence, occurredAt: "2026-11-07T10:00:00.000Z" });
  const member = (sequence: number, status = "active", role = "admin", userId = "usr_a") => ({ ...base(sequence), type: "membership.changed", data: { userId, role, status, membershipVersion: sequence } });
  /** Signs the event as given, then sends `sendBody` instead when a test wants a body that was changed after signing. */
  const deliver = (event: { eventId: string; [field: string]: unknown }, o: { secret?: string; url?: string; nowOffset?: number; sendBody?: string } = {}) => {
    const signed = JSON.stringify(event);
    const headers = signPlatformRequest(o.secret ?? SECRETS[0], event.eventId, signed, "POST", URL_, nowS + (o.nowOffset ?? 0));
    return handleEvent({ pool, secrets: SECRETS, headers, rawBody: o.sendBody ?? signed, method: "POST", url: o.url ?? URL_, now: nowS });
  };
  const rows = async () => (await pool.query("select user_id, role, status, membership_version from stub_membership order by user_id")).rows;
  const sequence = async () => (await pool.query("select last_sequence from stub_business_sequence where business_id = $1", [business])).rows[0]?.last_sequence ?? null;

  describe("events", () => {
    it("applies a new event, and a duplicate or older one is acknowledged but changes nothing", async () => {
      const e5 = member(5, "active", "admin");
      expect(await deliver(e5)).toEqual({ status: 200, applied: true });
      expect(await deliver(e5)).toEqual({ status: 200, applied: false });
      expect(await deliver(member(3, "removed", "admin"))).toEqual({ status: 200, applied: false });
      expect(await rows()).toEqual([{ user_id: "usr_a", role: "admin", status: "active", membership_version: 5 }]);
      expect(await deliver(member(6, "removed"))).toEqual({ status: 200, applied: true });
      expect((await rows())[0]).toMatchObject({ status: "removed", membership_version: 6 });
      expect(await sequence()).toBe(6);
    });
    it("out of order: a later event first, then the earlier one, leaves the later state", async () => {
      await deliver(member(8, "disabled"));
      expect(await deliver(member(7, "active"))).toEqual({ status: 200, applied: false });
      expect((await rows())[0].status).toBe("disabled");
    });
    it("two different events with the same sequence racing: exactly one applies", async () => {
      const results = await Promise.all([deliver(member(4, "active", "admin", "usr_x")), deliver(member(4, "active", "admin", "usr_y"))]);
      expect(results.filter((r) => r.status === 200 && r.applied)).toHaveLength(1);
      expect(await rows()).toHaveLength(1);
      expect(await sequence()).toBe(4);
    });
    it("applies organisation status and owner changes", async () => {
      await deliver({ ...base(1), type: "organisation.status", data: { status: "suspended" } });
      await deliver({ ...base(2), type: "owner.changed", data: { ownerUserIds: ["usr_a", "usr_b"], billingContactEmail: "billing@kitchen.test" } });
      const b = (await pool.query("select status, owner_user_ids, billing_contact_email from stub_business where business_id = $1", [business])).rows[0];
      expect(b).toEqual({ status: "suspended", owner_user_ids: ["usr_a", "usr_b"], billing_contact_email: "billing@kitchen.test" });
    });
    it("refuses (401) a wrong secret, a tampered body, another route, a stale timestamp and missing headers, and changes nothing", async () => {
      const e = member(1);
      expect(await deliver(e, { secret: "wrong" })).toMatchObject({ status: 401 });
      expect(await deliver(e, { sendBody: JSON.stringify(e).replace("admin", "owner") })).toMatchObject({ status: 401 });
      expect(await deliver(e, { url: "http://stub.localhost:3500/api/platform/other" })).toMatchObject({ status: 401 });
      expect(await deliver(e, { nowOffset: -1000 })).toMatchObject({ status: 401 });
      expect(await handleEvent({ pool, secrets: SECRETS, headers: {}, rawBody: JSON.stringify(e), method: "POST", url: URL_, now: nowS })).toMatchObject({ status: 401 });
      expect(await rows()).toEqual([]);
      expect(await sequence()).toBeNull();
    });
    it("refuses (400) a signed body that is not a valid event, or whose id differs from the signed one", async () => {
      const sign = (raw: string, id: string) => handleEvent({ pool, secrets: SECRETS, headers: signPlatformRequest(SECRETS[0], id, raw, "POST", URL_, nowS), rawBody: raw, method: "POST", url: URL_, now: nowS });
      expect(await sign("not json", "evt_x")).toMatchObject({ status: 400, error: "bad_json" });
      expect(await sign(JSON.stringify({ ...member(1), sequence: 0 }), newId("event"))).toMatchObject({ status: 400, error: "invalid_event" });
      expect(await sign(JSON.stringify(member(1)), newId("event"))).toMatchObject({ status: 400, error: "id_mismatch" });
      expect(await sequence()).toBeNull();
    });
    it("accepts the old or the new secret during a rotation", async () => {
      const both = ["old-secret", "new-secret"];
      for (const [i, secret] of both.entries()) {
        const e = member(i + 1);
        const raw = JSON.stringify(e);
        expect(await handleEvent({ pool, secrets: both, headers: signPlatformRequest(secret, e.eventId, raw, "POST", URL_, nowS), rawBody: raw, method: "POST", url: URL_, now: nowS })).toEqual({ status: 200, applied: true });
      }
    });
    it("a failure while applying leaves the sequence and the data as they were (all or nothing)", async () => {
      const failing = {
        // A view of one pooled connection whose membership insert fails; the real connection is untouched and goes back to the pool as it was.
        connect: async () => {
          const c = await pool.connect();
          const real = c.query.bind(c) as (...a: unknown[]) => unknown;
          return new Proxy(c, {
            get: (target, prop) => {
              if (prop === "query") return (...a: unknown[]) => (String(a[0]).includes("insert into stub_membership") ? Promise.reject(new Error("disk full")) : real(...a));
              const value = Reflect.get(target, prop);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        },
        query: pool.query.bind(pool),
      };
      const e = member(2);
      const raw = JSON.stringify(e);
      await expect(handleEvent({ pool: failing as unknown as Pool, secrets: SECRETS, headers: signPlatformRequest(SECRETS[0], e.eventId, raw, "POST", URL_, nowS), rawBody: raw, method: "POST", url: URL_, now: nowS })).rejects.toThrow("disk full");
      expect(await sequence()).toBeNull();
      expect(await rows()).toEqual([]);
      expect(await deliver(e)).toEqual({ status: 200, applied: true });
    });
  });

  // ---- access
  describe("access follows the product's own copy of the memberships, on every request", () => {
    it("needs an active membership in a business that is not suspended or closed", async () => {
      expect((await accessFor(pool, "usr_a")).allowed).toBe(false);
      await deliver(member(1, "active"));
      expect((await accessFor(pool, "usr_a")).allowed).toBe(true);
      await deliver(member(2, "disabled"));
      expect((await accessFor(pool, "usr_a")).allowed).toBe(false);
      await deliver(member(3, "active"));
      expect((await accessFor(pool, "usr_a")).allowed).toBe(true);
      await deliver({ ...base(4), type: "organisation.status", data: { status: "suspended" } });
      expect((await accessFor(pool, "usr_a")).allowed).toBe(false);
      await deliver({ ...base(5), type: "organisation.status", data: { status: "active" } });
      await deliver(member(6, "removed"));
      expect((await accessFor(pool, "usr_a")).allowed).toBe(false);
      expect((await accessFor(pool, "usr_a")).memberships).toEqual([{ businessId: business, role: "admin", status: "removed", businessStatus: "active" }]);
    });
    it("one person's membership is never another person's", async () => {
      await deliver(member(1, "active", "admin", "usr_a"));
      expect((await accessFor(pool, "usr_b")).allowed).toBe(false);
    });
  });
});
