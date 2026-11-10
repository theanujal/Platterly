import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization, genericOAuth } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import { ac, roles } from "./permissions";
import { rememberCentralSubject } from "@/lib/platform/central-subject";
import { consumePendingMembership } from "@/modules/platform-link/pending";
import { provisionTenantForNewUser } from "@/modules/tenants/auto-provision";
import { notify } from "@/lib/notifications/notify";
import { INVITATION_EXPIRES_IN_SECONDS, INVITATION_EXPIRY_HOURS } from "@/modules/team/invitation-config";
import { canonicalUrl } from "@/lib/seo/canonical";
import { trustedOrigins } from "@/lib/routing/hosts";
import { PLATFORM_CLIENT_ID, PLATFORM_PROVIDER_ID, platformIssuer } from "@/lib/platform/config";

/**
 * Auth core (Chunk 1 Group 1.3). Email/password is the first strategy; built
 * as a Better Auth plugin/provider setup so a second strategy (WhatsApp-OTP,
 * PRD §48) can be added later without touching callers of `auth`/`requireSession`.
 *
 * Better Auth's `organization` entity is this project's `Tenant` (PRD §55);
 * its `member` is the User<->Tenant<->Role link. Branch/Kitchen/Store (§47)
 * are separate Prisma models referencing `organizationId` directly — Better
 * Auth doesn't model physical locations.
 */
/**
 * The person's details from the Account's userinfo, for every central sign-in. The same fields Better Auth's default reads, with ONE addition: when the
 * Account's email differs from the email of the Caterly user already linked to this person AND a different Caterly user already holds the new address,
 * the linked user's current email is kept for this sign-in. Without that, the refresh would collide on Caterly's unique email and the person could not sign
 * in at all. Everything else (names, phone) still refreshes, and the email follows as soon as the clash is gone.
 */
async function fetchPlatterlyUserInfo(tokens: { accessToken?: string }): Promise<({ [key: string]: unknown; id: string; email: string; emailVerified: boolean; name?: string; image?: string }) | null> {
  if (!tokens.accessToken) return null;
  const discovery = (await (await fetch(`${platformIssuer()}/.well-known/openid-configuration`, { cache: "no-store" })).json().catch(() => null)) as { userinfo_endpoint?: string } | null;
  if (!discovery?.userinfo_endpoint) return null;
  const res = await fetch(discovery.userinfo_endpoint, { headers: { authorization: `Bearer ${tokens.accessToken}` }, cache: "no-store" });
  if (!res.ok) return null;
  const info = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!info || typeof info.sub !== "string" || typeof info.email !== "string") return null;
  rememberCentralSubject(info.email, info.sub);
  let email = info.email;
  const linked = await prisma.account.findFirst({ where: { providerId: PLATFORM_PROVIDER_ID, accountId: info.sub }, select: { userId: true, user: { select: { email: true } } } });
  if (linked && linked.user.email.toLowerCase() !== email.toLowerCase() && (await prisma.user.findFirst({ where: { email: email.toLowerCase(), NOT: { id: linked.userId } }, select: { id: true } }))) email = linked.user.email;
  return { ...info, id: info.sub, email, emailVerified: info.email_verified === true, image: typeof info.picture === "string" ? info.picture : undefined, name: typeof info.name === "string" ? info.name : undefined };
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // The app is served from several hosts (catering.*, ops.*), each with its
  // own host-only session cookie — deliberately no crossSubDomainCookies.
  trustedOrigins: trustedOrigins(),
  // Production rate limiting is per client IP. Behind Cloudflare/Nginx the socket address is the
  // proxy's, so without this every visitor shares one bucket and gets "Too many requests".
  // Nginx must overwrite (not append to) these headers, so a client can't forge its own IP.
  advanced: {
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
    // Chunk 17.3: session cookies are Secure in production (https only), never readable by scripts, and not sent on
    // cross-site requests. Stated here so a missing https base URL can never silently downgrade them.
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
  },
  // Only the production rehearsal (e2e through one IP) switches this off; never set it in production.
  ...(process.env.AUTH_RATE_LIMIT_OFF === "1" ? { rateLimit: { enabled: false } } : {}),
  // No password of Caterly's own (AJ, 2026-11-10): sign-in, sign-up, forgot-password and email verification are all done on Platterly's central pages, so the
  // email-and-password and email-code endpoints are switched off here and a hand-written request to them fails.
  emailAndPassword: {
    enabled: false,
  },
  // Single sign-in. A person is matched to a Caterly user in two steps, and only the first is by email:
  //  1. The FIRST central sign-in of someone who already has a Caterly user links them when the central email is verified (the provider only lets a verified
  //     address sign in, and says so in userinfo) AND the Caterly user's email is verified AND that Caterly user is not already linked to a different central
  //     identity (see the account hook below). The link is recorded once as an account row: provider "platterly", account id = the central subject.
  //  2. From then on the account row alone decides: the central subject finds the Caterly user, whatever either email later becomes.
  // Anything else (an unverified address on either side, an already-linked user) is refused as "account not linked" and creates no second user.
  account: { accountLinking: { enabled: true, requireLocalEmailVerified: true, trustedProviders: [] as string[] } },
  user: {
    additionalFields: {
      /**
       * A Super Admin (PRD §8) is a platform-level user with no organization
       * membership at all — this flag is the only thing that distinguishes
       * them, enforced by an app-level check (Chunk 3), never by the
       * organization access-control engine above.
       */
      isSuperAdmin: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      /**
       * Real source of truth for a person's name (AJ's explicit ask,
       * 2026-09-14) — `name` stays required by Better Auth's core schema
       * and is composed as `${firstName} ${lastName}`.trim() by every
       * caller below (signup, user-profile edit), so Better Auth's own
       * internal uses of `user.name` (session, invitation emails) are
       * unaffected.
       */
      firstName: {
        type: "string",
        required: false,
        input: true,
      },
      lastName: {
        type: "string",
        required: false,
        input: true,
      },
      /**
       * Collected at signup via the shared `PhoneInput` (AJ, 2026-09-19) —
       * required client-side on the signup form itself, but stays optional
       * here since accounts created before this field existed have none.
       */
      phone: {
        type: "string",
        required: false,
        input: true,
      },
    },
  },
  databaseHooks: {
    // One Caterly user can be linked to ONE central identity. If an email match would add a second, different central identity to a user who already has
    // one (for example a reused mailbox), the link is refused rather than handing that kitchen to the new person.
    account: {
      create: {
        before: async (account: { providerId: string; accountId: string; userId: string }) => {
          if (account.providerId !== PLATFORM_PROVIDER_ID) return;
          const other = await prisma.account.findFirst({ where: { userId: account.userId, providerId: PLATFORM_PROVIDER_ID, NOT: { accountId: account.accountId } }, select: { id: true } });
          if (other) return false;
        },
        // A person the Platform already made a member of a business joins it now, at their first central sign-in. Never lets a failure here break the sign-in.
        after: async (account: { providerId: string; accountId: string; userId: string }) => {
          if (account.providerId !== PLATFORM_PROVIDER_ID) return;
          try {
            await consumePendingMembership(account.userId, account.accountId);
          } catch (error) {
            console.error("pending membership was not applied", error instanceof Error ? error.message : "unknown");
          }
        },
      },
    },
    user: {
      create: {
        /**
         * Chunk 4 self-serve signup redesign — provisions the caterer's
         * Organization+Member immediately, before the onboarding wizard
         * ever renders (see `auto-provision.ts`). A Super Admin account is
         * never created through this path (Super Admins are provisioned
         * out-of-band, no sign-up UI exists at /super), so this always
         * means a self-service caterer signup.
         */
        after: async (user) => {
          await provisionTenantForNewUser(user.id);
        },
      },
    },
  },
  plugins: [
    organization({
      ac,
      roles,
      creatorRole: "owner",
      // AJ, 2026-09-30: invitation links are valid for 48 hours only.
      invitationExpiresIn: INVITATION_EXPIRES_IN_SECONDS,
      // Log-only today via notify() (Chunk 2's "interface now, integration
      // later" pattern) — real delivery is Chunk 16's job. better-auth
      // doesn't generate an accept URL itself; canonicalUrl() builds ours.
      sendInvitationEmail: async (data) => {
        await notify({
          organizationId: data.organization.id,
          channel: "EMAIL",
          event: "team.invitation_sent",
          recipient: { email: data.email },
          payload: {
            invitationId: data.id,
            role: data.role,
            organizationName: data.organization.name,
            inviterName: data.inviter.user.name,
            acceptUrl: canonicalUrl(`/invitations/${data.id}/accept`),
            expiresInHours: INVITATION_EXPIRY_HOURS,
          },
        });
      },
    }),
    /**
     * Central single sign-in (F8.1.1). Caterly is an OIDC client of Platterly's identity provider: authorization code with PKCE, the ID token verified
     * against the provider's keys with its nonce, and the person's email and name read from the provider's userinfo. The provider id "platterly" makes the
     * callback address /api/auth/callback/platterly, and signing out here also ends the central session (RP-initiated logout). A first-time central person
     * with no Caterly user gets one created (the same self-serve path as Caterly's own sign-up, including the tenant) until the central "activate Caterly"
     * flow replaces it. The provider's discovery document is read when this server starts: if Platterly's sign-in is down at that moment the provider is
     * skipped (logged) and central sign-in stays unavailable until Caterly is restarted, but Caterly itself still starts.
     */
    genericOAuth({
      config: [
        {
          providerId: PLATFORM_PROVIDER_ID,
          clientId: PLATFORM_CLIENT_ID,
          discoveryUrl: `${platformIssuer()}/.well-known/openid-configuration`,
          scopes: ["openid", "email", "profile"],
          pkce: true,
          redirectURI: canonicalUrl(`/api/auth/callback/${PLATFORM_PROVIDER_ID}`),
          postLogoutRedirectURI: canonicalUrl("/"),
          requireIdTokenVerification: true,
          // The Account is the source of truth for the common details: at EVERY central sign-in Caterly's copy of the person's name, first name, last name,
          // phone and email is refreshed from the Account's userinfo (an empty value never erases what Caterly has). This is how a change made in the Account
          // reaches Caterly until push events exist.
          overrideUserInfo: true,
          getUserInfo: fetchPlatterlyUserInfo,
          mapProfileToUser: (profile: Record<string, unknown>) => ({
            firstName: typeof profile.given_name === "string" ? profile.given_name : undefined,
            lastName: typeof profile.family_name === "string" ? profile.family_name : undefined,
            // The phone every product collects at sign-up, kept once in the Platterly Account and sent here as the standard phone_number claim.
            phone: typeof profile.phone_number === "string" ? profile.phone_number : undefined,
          }),
        },
      ],
    }),
    // Must stay last — sets/reads cookies via Next.js's own cookies() API.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
