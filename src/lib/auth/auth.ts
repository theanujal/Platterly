import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
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
    // Must stay last — sets/reads cookies via Next.js's own cookies() API.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
