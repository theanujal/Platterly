import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Jar, call, lastCode, openHarness, testUrl, type Harness } from "./helpers";
import { totpFromUri } from "./totp-util";

// Two-step verification through the provider's own endpoints, against the isolated identity test database.
describe.skipIf(!testUrl)("two-step verification (provider)", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await openHarness();
  }, 60_000);
  afterAll(async () => h?.pool.end());
  beforeEach(async () => {
    await h.pool.query('delete from "twoFactor"; delete from session; delete from account; delete from verification; delete from "rateLimit"; delete from "user"');
    h.codes.length = 0;
  });
  const PASSWORD = "correct horse 7";
  const to = "tf@x.test";
  async function person() {
    const jar = new Jar();
    await call(h, jar, "POST", "/api/auth/sign-up/email", { email: to, password: PASSWORD, name: "Tee Eff", firstName: "Tee", lastName: "Eff", phone: "+919800000001" });
    await call(h, jar, "POST", "/api/auth/email-otp/verify-email", { email: to, otp: lastCode(h, to, "email-verification")!.otp });
    const signIn = await call(h, jar, "POST", "/api/auth/sign-in/email", { email: to, password: PASSWORD });
    expect(signIn.status).toBe(200);
    return jar;
  }
  const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

  it("turns on with a first code, then a sign-in asks for a code and a right code signs in", async () => {
    const jar = await person();
    const enabled = await json(await call(h, jar, "POST", "/api/auth/two-factor/enable", { password: PASSWORD }));
    expect(String(enabled.totpURI)).toMatch(/^otpauth:\/\//);
    expect(Array.isArray(enabled.backupCodes)).toBe(true);
    // Not on until the first code is proved.
    expect((await h.pool.query(`select "twoFactorEnabled" from "user" where email = $1`, [to])).rows[0].twoFactorEnabled).toBeFalsy();
    const confirm = await call(h, jar, "POST", "/api/auth/two-factor/verify-totp", { code: totpFromUri(String(enabled.totpURI)) });
    expect(confirm.status).toBe(200);
    expect((await h.pool.query(`select "twoFactorEnabled" from "user" where email = $1`, [to])).rows[0].twoFactorEnabled).toBe(true);

    await call(h, jar, "POST", "/api/auth/sign-out");
    const fresh = new Jar();
    const first = await call(h, fresh, "POST", "/api/auth/sign-in/email", { email: to, password: PASSWORD });
    expect(first.status).toBe(200);
    expect((await json(first)).twoFactorRedirect).toBe(true);
    expect(fresh.names().some((n) => /session_token/.test(n)), "no session before the code").toBe(false);
    expect((await call(h, fresh, "POST", "/api/auth/two-factor/verify-totp", { code: "000000" })).status).toBe(401);
    const ok = await call(h, fresh, "POST", "/api/auth/two-factor/verify-totp", { code: totpFromUri(String(enabled.totpURI)) });
    expect(ok.status).toBe(200);
    expect(fresh.names().some((n) => /session_token/.test(n)), "a session after the right code").toBe(true);
  });

  it("a backup code signs in once and only once", async () => {
    const jar = await person();
    const enabled = await json(await call(h, jar, "POST", "/api/auth/two-factor/enable", { password: PASSWORD }));
    await call(h, jar, "POST", "/api/auth/two-factor/verify-totp", { code: totpFromUri(String(enabled.totpURI)) });
    const codes = enabled.backupCodes as string[];
    await call(h, jar, "POST", "/api/auth/sign-out");
    for (const [i, expected] of [200, 401].entries()) {
      const next = new Jar();
      await call(h, next, "POST", "/api/auth/sign-in/email", { email: to, password: PASSWORD });
      const res = await call(h, next, "POST", "/api/auth/two-factor/verify-backup-code", { code: codes[0] });
      expect(res.status, `try ${i + 1}`).toBe(expected);
    }
  });
});

// The Account enables, confirms, regenerates and disables two-step verification by presenting the provider session its own session points at.
import { newSessionIdFrom, providerSessionHeaders, twoFactorStatus } from "../../account/two-factor";
describe.skipIf(!testUrl)("two-step verification (from the Account)", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await openHarness();
  }, 60_000);
  afterAll(async () => h?.pool.end());
  const PASSWORD = "correct horse 7";
  const to = "acct-tf@x.test";
  it("works through a server-built session cookie, and refuses a session that is not the caller's", async () => {
    await h.pool.query('delete from "twoFactor"; delete from session; delete from account; delete from verification; delete from "rateLimit"; delete from "user"');
    const jar = new Jar();
    await call(h, jar, "POST", "/api/auth/sign-up/email", { email: to, password: PASSWORD, name: "A T", firstName: "A", lastName: "T", phone: "+919800000001" });
    await call(h, jar, "POST", "/api/auth/email-otp/verify-email", { email: to, otp: lastCode(h, to, "email-verification")!.otp });
    await call(h, jar, "POST", "/api/auth/sign-in/email", { email: to, password: PASSWORD });
    const row = (await h.pool.query(`select s.id as sid, s."userId" from session s join "user" u on u.id = s."userId" where u.email = $1`, [to])).rows[0];
    expect(await twoFactorStatus(h.pool, row.userId)).toEqual({ enabled: false });
    expect(await providerSessionHeaders(h.idp, h.pool, row.sid, "someone-else")).toBeNull();
    let headers = (await providerSessionHeaders(h.idp, h.pool, row.sid, row.userId))!;
    const step = async <T,>(name: string, f: () => Promise<T>) => f().catch((e) => { throw new Error(`${name}: ${e instanceof Error ? e.message : e}`); });
    const enabled = await step("enable", () => h.idp.api.enableTwoFactor({ body: { password: PASSWORD }, headers }));
    if (!("totpURI" in enabled)) throw new Error("expected an authenticator app set-up");
    expect(enabled.totpURI).toMatch(/^otpauth:\/\//);
    const verified = await step("verify", () => h.idp.api.verifyTOTP({ body: { code: totpFromUri(enabled.totpURI) }, headers, returnHeaders: true }));
    // Switching it on replaces the provider session; the Account re-points its cookie at the new one.
    const newSid = await newSessionIdFrom(h.idp, h.pool, verified.headers.getSetCookie());
    expect(newSid).toBeTruthy();
    expect(newSid).not.toBe(row.sid);
    headers = (await providerSessionHeaders(h.idp, h.pool, newSid!, row.userId))!;
    expect(await twoFactorStatus(h.pool, row.userId)).toEqual({ enabled: true });
    const regenerated = await step("backup", () => h.idp.api.generateBackupCodes({ body: { password: PASSWORD }, headers }));
    expect(regenerated.backupCodes.length).toBeGreaterThan(5);
    await step("disable", () => h.idp.api.disableTwoFactor({ body: { password: PASSWORD }, headers }));
    expect(await twoFactorStatus(h.pool, row.userId)).toEqual({ enabled: false });
  });
});
