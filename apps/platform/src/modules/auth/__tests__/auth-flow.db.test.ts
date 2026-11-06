import { createHash } from "node:crypto";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import type { IdentityLinkClient } from "../../users/identity-link";
import { findUserWithIdentities, insertUser, removeAllTestUsers, setUserStatus } from "../../users/__tests__/fixtures";
import { resolveAccountSession, sealAccountSession } from "../account-session";
import { ACCOUNT_CLIENT_ID, IDP_PROVIDER, accountRedirectUri } from "../config";
import { seal } from "../cookies";
import { beginSignIn, completeSignIn } from "../oidc-client";
import { endSession } from "../session-store";
import { Jar, call, lastCode, openHarness, testUrl, type Harness } from "./helpers";

// F4 against the real isolated test databases: the identity database (Better Auth) and a Platform test database for the user link. Mail is captured
// in memory (no email is sent). Nothing here touches the Stage 2 database, the 5432 cluster or any development data.
const platformUrl = process.env.PLATFORM_F4_TEST_DATABASE_URL;
const SECRET = "test-account-secret-".padEnd(48, "z");
const PASSWORD = "correct horse 7";
let n = 0;
const email = () => `person${Date.now()}${n++}@auth.test`;

describe.skipIf(!testUrl || !platformUrl)("F4 sign-in against the real identity and Platform test databases", () => {
  let h: Harness;
  let platformPool: Pool;
  let platform: PrismaClient;
  let link: IdentityLinkClient;

  beforeAll(async () => {
    h = await openHarness();
    platformPool = new Pool({ connectionString: platformUrl, max: 3 });
    platform = new PrismaClient({ adapter: new PrismaPg(platformPool) });
    link = platform as unknown as IdentityLinkClient;
  }, 60_000);
  afterAll(async () => {
    if (platform) await removeAllTestUsers(platform);
    await platform?.$disconnect();
    await platformPool?.end();
    await h?.pool.end();
  });
  beforeEach(async () => {
    await removeAllTestUsers(platform);
    await h.pool.query('delete from "rateLimit"');
    h.codes.length = 0;
    h.sendFails.value = false;
  });

  const signUp = (jar: Jar, to: string, password = PASSWORD) => call(h, jar, "POST", "/api/auth/sign-up/email", { email: to, password, name: "Test Person" });
  const verify = async (jar: Jar, to: string) => call(h, jar, "POST", "/api/auth/email-otp/verify-email", { email: to, otp: lastCode(h, to, "email-verification")!.otp });
  const signIn = (jar: Jar, to: string, password = PASSWORD) => call(h, jar, "POST", "/api/auth/sign-in/email", { email: to, password });
  const registered = async (to = email()) => {
    const jar = new Jar();
    await signUp(jar, to);
    await verify(jar, to);
    return { jar, to };
  };

  /** The whole code flow a browser would run: start, sign in at the provider, come back with a code, complete. */
  async function codeFlow(jar: Jar, tweak?: (authorizeUrl: URL) => void) {
    const { authorizeUrl, transaction } = beginSignIn(SECRET, "/products");
    const url = new URL(authorizeUrl);
    tweak?.(url);
    const res = await call(h, jar, "GET", `${url.pathname}${url.search}`);
    const location = res.headers.get("location") ?? "";
    return { res, location, transaction, params: location.startsWith("http") ? new URL(location).searchParams : new URLSearchParams() };
  }
  const finish = (transaction: string | undefined, params: URLSearchParams, now?: Date) => completeSignIn({ secret: SECRET, transactionCookie: transaction, params, handler: (r) => h.idp.handler(r), linkClient: link, now });

  describe("registration and verification", () => {
    it("sign-up sends one code and creates an unverified user who cannot sign in", async () => {
      const to = email();
      const jar = new Jar();
      const res = await signUp(jar, to);
      expect(res.status).toBe(200);
      expect(h.codes).toEqual([{ to, otp: expect.stringMatching(/^\d{6}$/), kind: "email-verification" }]);
      expect(jar.names(), "sign-up does not sign anyone in").toEqual([]);
      const refused = await signIn(jar, to);
      expect(refused.status).toBe(403);
      expect((await refused.json()).code).toBe("EMAIL_NOT_VERIFIED");
    });

    it("a duplicate sign-up looks exactly like a new one (no way to learn who is registered)", async () => {
      const { to } = await registered();
      const fresh = await signUp(new Jar(), email());
      const dup = await signUp(new Jar(), to);
      expect(dup.status).toBe(fresh.status);
      const shape = (b: Record<string, unknown>) => Object.keys(b).sort();
      expect(shape(await dup.json())).toEqual(shape(await fresh.json()));
    });

    it("refuses a short password and an over-long one, creating nobody", async () => {
      const short = await signUp(new Jar(), email(), "short1");
      const long = await signUp(new Jar(), email(), "x".repeat(129));
      expect(short.status).toBe(400);
      expect(long.status).toBe(400);
      expect(h.codes).toEqual([]);
    });

    it("a wrong code is refused, and after 5 wrong tries even the right code is refused", async () => {
      const to = email();
      const jar = new Jar();
      await signUp(jar, to);
      const right = lastCode(h, to)!.otp;
      const wrong = right === "000000" ? "111111" : "000000";
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) statuses.push((await call(h, jar, "POST", "/api/auth/email-otp/verify-email", { email: to, otp: wrong })).status);
      expect(statuses.every((s) => s === 400)).toBe(true);
      const late = await call(h, jar, "POST", "/api/auth/email-otp/verify-email", { email: to, otp: right });
      expect(late.status).not.toBe(200);
      const user = await h.pool.query('select "emailVerified" from "user" where email = $1', [to]);
      expect(user.rows[0].emailVerified).toBe(false);
    });

    it("an expired code is refused", async () => {
      const to = email();
      const jar = new Jar();
      await signUp(jar, to);
      await h.pool.query(`update "verification" set "expiresAt" = now() - interval '1 minute' where identifier like $1`, [`%${to}%`]);
      const res = await call(h, jar, "POST", "/api/auth/email-otp/verify-email", { email: to, otp: lastCode(h, to)!.otp });
      expect(res.status).not.toBe(200);
    });

    it("a second code within the 55-second window is refused", async () => {
      const to = email();
      const jar = new Jar();
      await signUp(jar, to);
      const first = await call(h, jar, "POST", "/api/auth/email-otp/send-verification-otp", { email: to, type: "email-verification" });
      const second = await call(h, jar, "POST", "/api/auth/email-otp/send-verification-otp", { email: to, type: "email-verification" });
      expect([first.status, second.status]).toContain(429);
    });

    it("when the mail service is down the sign-up still answers the same (mail is sent in the background so timing cannot reveal who is registered), nothing is delivered, and a later resend works", async () => {
      const to = email();
      const jar = new Jar();
      h.sendFails.value = true;
      const res = await signUp(jar, to);
      expect(res.status).toBe(200);
      await new Promise((r) => setTimeout(r, 50));
      expect(h.codes, "no code reached anyone").toEqual([]);
      h.sendFails.value = false;
      await h.pool.query('delete from "rateLimit"');
      expect((await call(h, jar, "POST", "/api/auth/email-otp/send-verification-otp", { email: to, type: "email-verification" })).status).toBe(200);
      expect((await verify(jar, to)).status).toBe(200);
    });

    it("verifying then signing in sets one host-only, HttpOnly, SameSite=Lax session cookie, and no cache cookie", async () => {
      const { jar, to } = await registered();
      const res = await signIn(jar, to);
      expect(res.status).toBe(200);
      const cookies = res.headers.getSetCookie();
      expect(cookies.map((c) => c.split("=")[0])).toEqual(["platterly-idp.session_token"]);
      const flags = cookies[0].toLowerCase();
      expect(flags).toContain("httponly");
      expect(flags).toContain("samesite=lax");
      expect(flags).not.toContain("domain=");
      expect(flags).toContain("path=/");
      expect(jar.names().some((c) => /session_data|cache/.test(c))).toBe(false);
    });
  });

  describe("sign-in hardening", () => {
    it("a wrong password and an unknown email get the same answer", async () => {
      const { to } = await registered();
      const wrong = await signIn(new Jar(), to, "not the password 9");
      const unknown = await signIn(new Jar(), email(), "not the password 9");
      expect(wrong.status).toBe(unknown.status);
      expect(await wrong.json()).toEqual(await unknown.json());
    });

    it("brute force is stopped: more than 5 attempts a minute are refused with 429, even with the right password after", async () => {
      const { to } = await registered();
      const statuses: number[] = [];
      for (let i = 0; i < 7; i++) statuses.push((await signIn(new Jar(), to, "wrong password 1")).status);
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
      expect((await signIn(new Jar(), to)).status).toBe(429);
    });
  });

  describe("authorization code flow and the Account session", () => {
    it("signs a verified person in, creates and links the Platform user, and the Account cookie resolves to a live session", async () => {
      const { jar, to } = await registered();
      await signIn(jar, to);
      const { res, params, transaction } = await codeFlow(jar);
      expect(res.status).toBe(302);
      expect(params.get("code")).toBeTruthy();
      const done = await finish(transaction, params);
      expect(done).toMatchObject({ ok: true, created: true, next: "/products" });
      if (!done.ok) throw new Error("unreachable");
      const user = await findUserWithIdentities(platform, to);
      expect(user).toMatchObject({ id: done.userId, status: "active" });
      expect(user!.emailVerifiedAt).not.toBeNull();
      expect(user!.identities).toMatchObject([{ provider: IDP_PROVIDER, subject: done.sub }]);
      const cookie = sealAccountSession(SECRET, { sid: done.sid, sub: done.sub, uid: done.userId });
      const resolved = await resolveAccountSession(h.pool, SECRET, cookie);
      expect(resolved?.session.userId).toBe(done.userId);
      // A second sign-in finds the same user.
      const again = await codeFlow(jar);
      const second = await finish(again.transaction, again.params);
      expect(second).toMatchObject({ ok: true, created: false, userId: done.userId });
    });

    it("without a session at the provider, authorize sends the browser to the sign-in page, never to the Account", async () => {
      const { res, location } = await codeFlow(new Jar());
      expect(res.status).toBe(302);
      expect(new URL(location, "http://auth.localhost:3300").pathname).toBe("/sign-in");
      expect(location).not.toContain("code=");
    });

    it("refuses a missing, tampered or expired transaction cookie, and a state that does not match", async () => {
      const { jar, to } = await registered();
      await signIn(jar, to);
      const ok = await codeFlow(jar);
      expect(await finish(undefined, ok.params)).toEqual({ ok: false, reason: "bad_transaction" });
      expect(await finish("garbage.value", ok.params)).toEqual({ ok: false, reason: "bad_transaction" });
      const tampered = ok.transaction.replace(/^./, (c) => (c === "A" ? "B" : "A"));
      expect(await finish(tampered, ok.params)).toEqual({ ok: false, reason: "bad_transaction" });
      expect(await finish(ok.transaction, ok.params, new Date(Date.now() + 11 * 60 * 1000))).toEqual({ ok: false, reason: "bad_transaction" });
      const wrongState = new URLSearchParams(ok.params);
      wrongState.set("state", "someone-elses-state");
      expect(await finish(ok.transaction, wrongState)).toEqual({ ok: false, reason: "state_mismatch" });
      expect(await findUserWithIdentities(platform, to)).toBeNull();
    });

    it("a code works once: replaying it is refused", async () => {
      const { jar, to } = await registered();
      await signIn(jar, to);
      const flow = await codeFlow(jar);
      expect((await finish(flow.transaction, flow.params)).ok).toBe(true);
      expect(await finish(flow.transaction, flow.params)).toEqual({ ok: false, reason: "token_exchange_failed" });
    });

    it("a code cannot be redeemed with the wrong PKCE verifier", async () => {
      const { jar, to } = await registered();
      await signIn(jar, to);
      const flow = await codeFlow(jar);
      const res = await h.idp.handler(
        new Request("http://auth.localhost:3300/api/auth/oauth2/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://account.localhost:3300" },
          body: new URLSearchParams({ grant_type: "authorization_code", code: flow.params.get("code")!, redirect_uri: accountRedirectUri(), client_id: ACCOUNT_CLIENT_ID, code_verifier: "w".repeat(60) }),
        }),
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it("refuses an authorize request with no PKCE challenge, and one with another redirect URI (nothing is sent to it)", async () => {
      const { jar, to } = await registered();
      await signIn(jar, to);
      const noPkce = await codeFlow(jar, (u) => {
        u.searchParams.delete("code_challenge");
        u.searchParams.delete("code_challenge_method");
      });
      expect(noPkce.location.includes("code=")).toBe(false);
      const evil = await codeFlow(jar, (u) => u.searchParams.set("redirect_uri", "http://evil.localhost:3300/auth/callback"));
      expect(evil.location.includes("evil.localhost")).toBe(false);
      expect(evil.location.includes("code=")).toBe(false);
      const plain = await codeFlow(jar, (u) => u.searchParams.set("code_challenge_method", "plain"));
      expect(plain.location.includes("code=")).toBe(false);
    });

    it("refuses an ID token whose nonce is not the one this browser asked for", async () => {
      const { jar, to } = await registered();
      await signIn(jar, to);
      const flow = await codeFlow(jar, (u) => u.searchParams.set("nonce", "an-attackers-nonce"));
      expect(await finish(flow.transaction, flow.params)).toEqual({ ok: false, reason: "invalid_id_token" });
    });

    it("refuses a disabled Platform user and an email that already belongs to a different user, creating nothing", async () => {
      const a = await registered();
      await signIn(a.jar, a.to);
      const first = await codeFlow(a.jar);
      expect((await finish(first.transaction, first.params)).ok).toBe(true);
      await setUserStatus(platform, a.to, "disabled");
      const second = await codeFlow(a.jar);
      expect(await finish(second.transaction, second.params)).toEqual({ ok: false, reason: "link_refused" });

      const b = await registered();
      await insertUser(platform, { email: b.to });
      await signIn(b.jar, b.to);
      const third = await codeFlow(b.jar);
      expect(await finish(third.transaction, third.params)).toEqual({ ok: false, reason: "link_refused" });
      expect((await findUserWithIdentities(platform, b.to))!.identities).toEqual([]);
    });

    it("a forged Account cookie, or one for a session that never existed, resolves to nobody", async () => {
      expect(await resolveAccountSession(h.pool, SECRET, "forged")).toBeNull();
      expect(await resolveAccountSession(h.pool, SECRET, sealAccountSession(SECRET, { sid: "no-such-session", sub: "x", uid: "y" }))).toBeNull();
      expect(await resolveAccountSession(h.pool, "another-secret".padEnd(48, "q"), sealAccountSession(SECRET, { sid: "a", sub: "b", uid: "c" }))).toBeNull();
      expect(await resolveAccountSession(h.pool, SECRET, seal({ v: 1, sid: "a", sub: "b", uid: "c", iat: 1, exp: 9999999999 }, SECRET, "oidc-transaction"))).toBeNull();
    });
  });

  describe("revocation, expiry and password reset", () => {
    async function liveAccount() {
      const { jar, to } = await registered();
      await signIn(jar, to);
      const flow = await codeFlow(jar);
      const done = await finish(flow.transaction, flow.params);
      if (!done.ok) throw new Error("setup failed");
      return { jar, to, done, cookie: sealAccountSession(SECRET, { sid: done.sid, sub: done.sub, uid: done.userId }) };
    }

    it("signing out ends the provider session at once: the Account cookie stops working in the same instant", async () => {
      const { done, cookie } = await liveAccount();
      expect(await resolveAccountSession(h.pool, SECRET, cookie)).not.toBeNull();
      expect(await endSession(h.pool, done.sid, done.sub)).toBe(true);
      expect(await resolveAccountSession(h.pool, SECRET, cookie)).toBeNull();
    });

    it("a person can end only their own session", async () => {
      const one = await liveAccount();
      const two = await liveAccount();
      expect(await endSession(h.pool, one.done.sid, two.done.sub)).toBe(false);
      expect(await resolveAccountSession(h.pool, SECRET, one.cookie)).not.toBeNull();
    });

    it("idle expiry and absolute expiry both end a session", async () => {
      const idle = await liveAccount();
      await h.pool.query(`update "session" set "expiresAt" = now() - interval '1 second' where id = $1`, [idle.done.sid]);
      expect(await resolveAccountSession(h.pool, SECRET, idle.cookie)).toBeNull();
      const absolute = await liveAccount();
      await h.pool.query(`update "session" set "createdAt" = now() - interval '31 days', "expiresAt" = now() + interval '1 day' where id = $1`, [absolute.done.sid]);
      expect(await resolveAccountSession(h.pool, SECRET, absolute.cookie)).toBeNull();
    });

    it("a live session is renewed (its idle expiry moves forward) but never past its absolute end", async () => {
      const acc = await liveAccount();
      await h.pool.query(`update "session" set "updatedAt" = now() - interval '2 days', "expiresAt" = now() + interval '1 hour' where id = $1`, [acc.done.sid]);
      expect(await resolveAccountSession(h.pool, SECRET, acc.cookie)).not.toBeNull();
      const { rows } = await h.pool.query(`select "expiresAt" > now() + interval '6 days' as renewed from "session" where id = $1`, [acc.done.sid]);
      expect(rows[0].renewed).toBe(true);
      await h.pool.query(`update "session" set "createdAt" = now() - interval '29 days 23 hours', "updatedAt" = now() - interval '2 days', "expiresAt" = now() + interval '1 hour' where id = $1`, [acc.done.sid]);
      expect(await resolveAccountSession(h.pool, SECRET, acc.cookie)).not.toBeNull();
      const capped = await h.pool.query(`select "expiresAt" < now() + interval '2 hours' as capped from "session" where id = $1`, [acc.done.sid]);
      expect(capped.rows[0].capped).toBe(true);
    });

    it("a session whose provider user differs from the cookie's subject is refused", async () => {
      const acc = await liveAccount();
      const swapped = sealAccountSession(SECRET, { sid: acc.done.sid, sub: "someone-else", uid: acc.done.userId });
      expect(await resolveAccountSession(h.pool, SECRET, swapped)).toBeNull();
    });

    it("a password reset with the emailed code changes the password and ends every other session", async () => {
      const acc = await liveAccount();
      const jar = new Jar();
      const sent = await call(h, jar, "POST", "/api/auth/email-otp/send-verification-otp", { email: acc.to, type: "forget-password" });
      expect(sent.status).toBe(200);
      const code = lastCode(h, acc.to, "forget-password")!;
      expect(code).toBeDefined();
      const reset = await call(h, jar, "POST", "/api/auth/email-otp/reset-password", { email: acc.to, otp: code.otp, password: "a brand new pass 5" });
      expect(reset.status).toBe(200);
      expect(await resolveAccountSession(h.pool, SECRET, acc.cookie), "the old session is gone").toBeNull();
      expect((await signIn(new Jar(), acc.to, PASSWORD)).status).toBeGreaterThanOrEqual(400);
      expect((await signIn(new Jar(), acc.to, "a brand new pass 5")).status).toBe(200);
    });

    it("a reset code for an unknown email gives the same answer as for a known one", async () => {
      const known = await registered();
      const a = await call(h, new Jar(), "POST", "/api/auth/email-otp/send-verification-otp", { email: known.to, type: "forget-password" });
      await h.pool.query('delete from "rateLimit"');
      const b = await call(h, new Jar(), "POST", "/api/auth/email-otp/send-verification-otp", { email: email(), type: "forget-password" });
      expect(b.status).toBe(a.status);
      expect(await b.json()).toEqual(await a.json());
    });
  });

  it("the discovery document and key set exist, and the PKCE challenge method is S256 only", async () => {
    const d = await call(h, new Jar(), "GET", "/api/auth/.well-known/openid-configuration");
    const doc = await d.json();
    expect(doc).toMatchObject({ issuer: "http://auth.localhost:3300/api/auth", response_types_supported: ["code"] });
    expect(doc.code_challenge_methods_supported).toEqual(["S256"]);
    const keys = await (await call(h, new Jar(), "GET", "/api/auth/jwks")).json();
    expect(keys.keys.length).toBeGreaterThan(0);
    expect(createHash("sha256").update("x").digest("hex")).toHaveLength(64);
  });
});
