import "server-only";
import { betterAuth } from "better-auth";
import { emailOTP, jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import type { Pool } from "pg";
import { APIError } from "better-auth/api";
import { trustedOrigins } from "@/lib/routing/hosts";
import { normalizePhone } from "@/modules/account/phone";
import { ACCOUNT_SCOPES, COOKIES, OTP, PASSWORD, SESSION_POLICY, authOrigin } from "./config";
import { identityPool } from "./identity-db";
import { otpEmail, sendAuthEmail, type OtpKind } from "./mailer";

// The identity provider (D1: Better Auth), served on the auth host at /api/auth. It owns credentials, sessions and the OIDC endpoints.
// Hardening choices (F4.3.2): host-only cookies (no cross-subdomain), HttpOnly, SameSite=Lax, Secure in production; NO cookie cache (so a revoked
// session ends at once, as D2 requires); rate limits kept in the database; the client IP is read only from headers a proxy overwrites.
export type IdpOptions = { /** Tests set this explicitly so they never depend on the local-only environment switch. */ rateLimitOff?: boolean; pool?: Pool; secret?: string; baseURL?: string; sendOtp?: (to: string, otp: string, kind: OtpKind) => Promise<void> };

export function createIdp(options: IdpOptions = {}) {
  const secret = options.secret ?? process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters");
  const production = process.env.NODE_ENV === "production";
  const sendOtp = options.sendOtp ?? (async (to, otp, kind) => sendAuthEmail(otpEmail(to, otp, kind)));

  return betterAuth({
    appName: "Platterly",
    baseURL: options.baseURL ?? authOrigin(),
    basePath: "/api/auth",
    secret,
    database: options.pool ?? identityPool(),
    trustedOrigins: trustedOrigins(),
    // The common details every product collects at sign-up (the same fields Caterly's own sign-up had). The display name is first + last.
    user: {
      additionalFields: {
        firstName: { type: "string", required: false, input: true },
        lastName: { type: "string", required: false, input: true },
        phone: { type: "string", required: false, input: true },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const u = user as typeof user & { firstName?: unknown; lastName?: unknown; phone?: unknown };
            const first = typeof u.firstName === "string" ? u.firstName.trim().replace(/\s+/g, " ") : "";
            const last = typeof u.lastName === "string" ? u.lastName.trim().replace(/\s+/g, " ") : "";
            const phone = typeof u.phone === "string" ? normalizePhone(u.phone) : null;
            if (!first || !last || first.length > 40 || last.length > 40 || /[\u0000-\u001f<>]/.test(first + last)) throw new APIError("BAD_REQUEST", { message: "Enter your first and last name." });
            if (!phone) throw new APIError("BAD_REQUEST", { message: "Enter a valid phone number." });
            return { data: { ...user, firstName: first, lastName: last, phone, name: `${first} ${last}` } };
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD.minLength,
      maxPasswordLength: PASSWORD.maxLength,
      requireEmailVerification: true,
      autoSignIn: false,
      // F4.1.2 acceptance: a password reset ends every other session.
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: SESSION_POLICY.idleSeconds,
      updateAge: SESSION_POLICY.updateAgeSeconds,
      cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix: COOKIES.idpPrefix,
      useSecureCookies: production,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
    },
    rateLimit: {
      // Only a local end-to-end run (many sign-ups from one IP) may switch the limits off, and never in production: the variable is ignored there.
      enabled: !((options.rateLimitOff ?? process.env.AUTH_RATE_LIMIT_OFF === "1") && !production),
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/email-otp/send-verification-otp": { window: OTP.resendSeconds, max: 1 },
        "/email-otp/verify-email": { window: 60, max: 10 },
        "/email-otp/reset-password": { window: 60, max: 10 },
        "/forget-password/email-otp": { window: OTP.resendSeconds, max: 1 },
      },
    },
    plugins: [
      emailOTP({
        otpLength: OTP.length,
        expiresIn: OTP.expiresInSeconds,
        allowedAttempts: OTP.allowedAttempts,
        sendVerificationOnSignUp: true,
        overrideDefaultEmailVerification: true,
        async sendVerificationOTP({ email, otp, type }) {
          await sendOtp(email, otp, type);
        },
      }),
      jwt(),
      oauthProvider({
        loginPage: "/sign-in",
        consentPage: "/consent",
        scopes: [...ACCOUNT_SCOPES],
        allowDynamicClientRegistration: false,
        // Products read the common details from userinfo (with the profile scope): first and last name, and the phone.
        customUserInfoClaims: ({ user, scopes }) => {
          const u = user as Record<string, unknown>;
          const claims: Record<string, string> = {};
          if (scopes.includes("profile")) {
            if (typeof u.firstName === "string" && u.firstName) claims.given_name = u.firstName;
            if (typeof u.lastName === "string" && u.lastName) claims.family_name = u.lastName;
            if (typeof u.phone === "string" && u.phone) claims.phone_number = u.phone;
          }
          return claims;
        },
      }),
    ],
  });
}

export type Idp = ReturnType<typeof createIdp>;

declare global {
  var __idp2: Idp | undefined;
}

/** One provider instance per server process. */
export function idp(): Idp {
  if (!globalThis.__idp2) globalThis.__idp2 = createIdp();
  return globalThis.__idp2;
}
