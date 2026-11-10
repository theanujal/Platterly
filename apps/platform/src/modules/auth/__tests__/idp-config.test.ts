import { afterEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { COOKIES, OTP, PASSWORD, SESSION_POLICY } from "../config";
import { createIdp } from "../idp";

// Static checks of the identity provider's configuration (no database is touched: the pool is never used).
const pool = new Pool({ connectionString: "postgresql://nobody@127.0.0.1:1/none" });
const idp = createIdp({ pool, rateLimitOff: false, secret: "c".repeat(48), sendOtp: async () => undefined });
type Opts = { advanced: { crossSubDomainCookies?: unknown; cookiePrefix: string; defaultCookieAttributes: unknown }; session: { cookieCache: { enabled: boolean }; expiresIn: number; updateAge: number }; emailAndPassword: unknown; rateLimit: { enabled: boolean; customRules: Record<string, { window: number; max: number }> } & Record<string, unknown>; trustedOrigins: string[]; plugins: { id: string }[] };
const options = idp.options as unknown as Opts;

afterEach(() => vi.unstubAllEnvs());

describe("identity provider configuration", () => {
  it("refuses to start without a long secret", () => {
    expect(() => createIdp({ pool, secret: "short" })).toThrow(/AUTH_SECRET/);
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => createIdp({ pool, secret: undefined })).toThrow(/AUTH_SECRET/);
    vi.stubEnv("AUTH_SECRET", "y".repeat(31));
    expect(() => createIdp({ pool, secret: undefined })).toThrow(/AUTH_SECRET/);
  });
  it("uses host-only cookies: no cross-subdomain setting, a Platterly prefix, HttpOnly and SameSite=Lax", () => {
    expect(options.advanced?.crossSubDomainCookies).toBeUndefined();
    expect(options.advanced.cookiePrefix).toBe(COOKIES.idpPrefix);
    expect(options.advanced.defaultCookieAttributes).toEqual({ httpOnly: true, sameSite: "lax" });
  });
  it("has no cookie cache, so a revoked session ends at once (D2)", () => {
    expect(options.session.cookieCache.enabled).toBe(false);
    expect(options.session.expiresIn).toBe(SESSION_POLICY.idleSeconds);
    expect(options.session.updateAge).toBe(SESSION_POLICY.updateAgeSeconds);
  });
  it("requires a verified email to sign in, does not sign in at sign-up, and ends other sessions on a password reset", () => {
    expect(options.emailAndPassword).toMatchObject({ enabled: true, requireEmailVerification: true, autoSignIn: false, revokeSessionsOnPasswordReset: true, minPasswordLength: PASSWORD.minLength });
  });
  it("rate-limits the sensitive routes from the database, including a 55-second resend window", () => {
    expect(options.rateLimit).toMatchObject({ enabled: true, storage: "database" });
    const rules = options.rateLimit.customRules;
    expect(rules["/sign-in/email"].max).toBeLessThanOrEqual(5);
    expect(rules["/sign-up/email"].max).toBe(10); // AJ, 2026-11-10: 10 sign-ups a minute per address, up from 5
    expect(rules["/email-otp/send-verification-otp"]).toEqual({ window: OTP.resendSeconds, max: 1 });
    expect(rules["/forget-password/email-otp"]).toEqual({ window: OTP.resendSeconds, max: 1 });
  });
  it("the local-only switch can turn rate limits off outside production, and is ignored in production", () => {
    vi.stubEnv("AUTH_RATE_LIMIT_OFF", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect((createIdp({ pool, secret: "c".repeat(48) }).options as unknown as Opts).rateLimit.enabled).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect((createIdp({ pool, secret: "c".repeat(48) }).options as unknown as Opts).rateLimit.enabled).toBe(true);
  });
  it("does not allow dynamic client registration, and trusts only the platform's own origins", () => {
    expect(options.trustedOrigins.sort()).toEqual(["http://account.localhost:3300", "http://auth.localhost:3300", "http://store.localhost:3300"]);
    const provider = options.plugins.map((p) => p.id);
    expect(provider).toEqual(expect.arrayContaining(["email-otp", "jwt", "oauth-provider"]));
  });
});
