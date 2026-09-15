import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization, emailOTP } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import { ac, roles } from "./permissions";
import { provisionTenantForNewUser } from "@/modules/tenants/auto-provision";
import { notify } from "@/lib/notifications/notify";
import { canonicalUrl } from "@/lib/seo/canonical";

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
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
  },
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
    },
  },
  databaseHooks: {
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
      // Chunk 5 Group 5.2 — spec asks for a 7-day expiry (default is 48h).
      invitationExpiresIn: 60 * 60 * 24 * 7,
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
          },
        });
      },
    }),
    /**
     * AJ's explicit ask (2026-09-16): a 6-digit email OTP right after
     * sign-up, gating both post-signup entry points (onboarding and the
     * invitation-accept page — see their own `emailVerified` guards).
     * Deliberately NOT routed through the tenant-scoped `notify()`
     * interface, unlike `sendInvitationEmail` above — `auto-provision.ts`
     * returns `organizationId: null` for a user signing up to accept a
     * pending invitation, so no Organization is guaranteed to exist yet at
     * this point. Log-only for now (AJ's explicit choice, same "interface
     * now, integration later" convention as everything else pre-Chunk-16)
     * — swap the one `console.log` line for a real provider call once a
     * provider exists; nothing else here changes.
     */
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "email-verification") return;
        console.log(`[dev-only] Email verification OTP for ${email}: ${otp}`);
      },
    }),
    // Must stay last — sets/reads cookies via Next.js's own cookies() API.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
