import "server-only";
import { betterAuth } from "better-auth";
import { emailOTP, jwt, twoFactor } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import type { Pool } from "pg";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { recoveryDelivery } from "@/modules/account/recovery-email";
import { recordSignIn } from "@/modules/account/sign-in-history";
import { TRUST_MAX_AGE_SECONDS, labelTrustedDevice, removeAllTrustedDevices } from "@/modules/account/trusted-devices";
import { deviceLabel } from "@/modules/account/devices";
import { alertIfNewDevice } from "@/modules/account/new-sign-in-alert";
import { trustedOrigins } from "@/lib/routing/hosts";
import { normalizePhone } from "@/modules/account/phone";
import { ACCOUNT_SCOPES, COOKIES, OTP, PASSWORD, SESSION_POLICY, authOrigin } from "./config";
import { mayStartSession } from "../account/hold";
import { identityPool } from "./identity-db";
import { OAUTH_QUERY_HEADER } from "./sign-up-gate";
import { signedProduct } from "./sign-up-origin";
import { inviteAllowsSignUp } from "../ownership-transfer/invite-signup";
import { provisionBusinessForVerifiedSignup } from "../organisations/signup-business-run";
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

  const pool = options.pool ?? identityPool();
  return betterAuth({
    appName: "Platterly",
    baseURL: options.baseURL ?? authOrigin(),
    basePath: "/api/auth",
    secret,
    database: pool,
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
      // Every new session is a sign-in: it goes in that person's own history (device label and time only).
      session: {
        create: {
          // A held account (the old address cancelled an email change) cannot start a session, here or through a product, until Ops staff have verified the person.
          before: async (session) => {
            if (!(await mayStartSession(pool, session.userId))) throw new APIError("FORBIDDEN", { message: "Your account is under review. Contact Platterly support.", code: "ACCOUNT_ON_HOLD" });
          },
          after: async (session) => {
            await alertIfNewDevice(pool, session.userId, session.userAgent); // before the history write, so the new device is compared with the earlier ones
            await recordSignIn(pool, { userId: session.userId, outcome: "signed_in", userAgent: session.userAgent });
          },
        },
      },
      // A trusted device gets a plain label (browser and system) so the person can tell them apart in the Account.
      verification: {
        create: {
          after: async (verification, context) => {
            const v = verification as { identifier?: string; value?: string };
            if (!v.identifier?.startsWith("trust-device-") || !v.value) return;
            await labelTrustedDevice(pool, v.identifier, v.value, deviceLabel(context?.headers?.get("user-agent")));
          },
        },
      },
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
    hooks: {
      // Sign-up only from a product: the form sends the provider-SIGNED address the person arrived on, and a missing, forged, expired or non-product one is refused (see sign-up-gate.ts).
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        const arrivedWith = ctx.headers?.get(OAUTH_QUERY_HEADER);
        // The other way in: an Admin-transfer invitation for exactly this address (see ownership-transfer/invite-signup.ts).
        if (!(await signedProduct(pool, arrivedWith, ctx.context.secret)) && !(await inviteAllowsSignUp(arrivedWith, (ctx.body as { email?: unknown } | undefined)?.email))) {
          throw new APIError("FORBIDDEN", { message: "Accounts are created when you first use a Platterly product.", code: "SIGN_UP_FROM_PRODUCT_ONLY" });
        }
      }),
      // A refused password for a real person is recorded too. The answer to the caller is unchanged (nothing here says whether the address exists).
      after: createAuthMiddleware(async (ctx) => {
        // Single sign-up: remember the product the person signed up from, then create their business once the email is verified (docs/single-signup-business-plan.md).
        // Neither step may change the answer the person gets: a failure is logged and the first sign-in tries again.
        if ((ctx.path === "/sign-up/email" || ctx.path === "/email-otp/verify-email") && !(ctx.context.returned instanceof APIError)) {
          try {
            const email = (ctx.body as { email?: unknown } | undefined)?.email;
            const found = typeof email === "string" ? await ctx.context.internalAdapter.findUserByEmail(email.toLowerCase()) : null;
            if (found && ctx.path === "/sign-up/email") {
              const product = await signedProduct(pool, ctx.headers?.get(OAUTH_QUERY_HEADER), ctx.context.secret);
              if (product) await pool.query(`insert into "signupProduct" ("userId", "clientId") values ($1, $2) on conflict ("userId") do nothing`, [found.user.id, product]);
            } else if (found) {
              await provisionBusinessForVerifiedSignup(found.user.id);
            }
          } catch (error) {
            console.error("[signup] after-hook failed:", error);
          }
          return;
        }
        // A password reset ends every trusted device, like a password change in the Account does.
        if (ctx.path === "/email-otp/reset-password" && !(ctx.context.returned instanceof APIError)) {
          try {
            const body = ctx.body as { email?: unknown } | undefined;
            const found = typeof body?.email === "string" ? await ctx.context.internalAdapter.findUserByEmail(body.email.toLowerCase()) : null;
            if (found) await removeAllTrustedDevices(pool, found.user.id);
          } catch {
            /* the reset itself already succeeded */
          }
          return;
        }
        if (ctx.path !== "/sign-in/email" || !(ctx.context.returned instanceof APIError)) return;
        try {
          const body = ctx.body as { email?: unknown } | undefined;
          if (typeof body?.email !== "string") return;
          const found = await ctx.context.internalAdapter.findUserByEmail(body.email.toLowerCase());
          // Only a refused PASSWORD counts (a refusal for an unverified email is not a wrong-password attempt).
          if (found && ctx.context.returned.status === "UNAUTHORIZED") await recordSignIn(pool, { userId: found.user.id, outcome: "wrong_password", userAgent: ctx.headers?.get("user-agent") });
        } catch {
          /* history never changes the sign-in answer */
        }
      }),
    },
    // Single sign-up (AJ, 2026-11-14): entering the emailed code both verifies the address and signs the person in, so a new person goes straight back to the product
    // they came from. The new session still passes every session rule (account hold, new-device alert, history).
    emailVerification: { autoSignInAfterVerification: true },
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
        "/sign-up/email": { window: 60, max: 10 },
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
          // The recovery-email reset route sends a password-reset code to the person's verified recovery address instead of the main one (only for that type).
          const redirect = type === "forget-password" ? recoveryDelivery.getStore() : undefined;
          await sendOtp(redirect?.to ?? email, otp, type);
        },
      }),
      // Two-step verification: an authenticator app (TOTP) plus backup codes. Off for everyone until they turn it on in the Account. A person who has it
      // is asked for a code after the password; "trust this device" skips the code on that browser until the person removes it or changes their password.
      twoFactor({ issuer: "Platterly", trustDeviceMaxAge: TRUST_MAX_AGE_SECONDS }),
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
  var __idp6: Idp | undefined;
}

/** One provider instance per server process. */
export function idp(): Idp {
  if (!globalThis.__idp6) globalThis.__idp6 = createIdp();
  return globalThis.__idp6;
}
