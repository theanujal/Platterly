import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { generatePlaceholderSlug } from "./slug";
import { ensureTrialPlan } from "@/modules/subscriptions/trial-plan";
import { assignPlan } from "@/modules/subscriptions/subscription";

/**
 * Runs immediately after a new caterer/kitchen-admin account is created
 * (wired via `databaseHooks.user.create.after` in `src/lib/auth/auth.ts`),
 * before the onboarding wizard ever renders. This is what makes onboarding
 * genuinely one-time: a Member row exists from the very first request after
 * signup, so an interrupted/abandoned session always resolves to the
 * Dashboard on next login — the wizard is only ever reached via the sign-up
 * form's own post-success redirect, never by any server-side "is this user
 * still onboarding" check.
 *
 * Bypasses `auth.api.createOrganization` (which needs request headers and
 * would require a second round-trip after signUp.email resolves) in favor
 * of the same direct-Prisma pattern `tenant.ts`'s Super Admin functions
 * already use. The placeholder name/slug are never shown to the user —
 * wizard Step 1's Business Name field starts from empty client state
 * regardless of what's in the database.
 *
 * Chunk 5 Group 5.2 — this hook fires for EVERY new user, including someone
 * signing up specifically to accept a team invitation. Left unguarded, an
 * invited teammate would get their own stray Organization+trial here before
 * ever reaching the accept-invitation flow, ending up a member of two
 * tenants. If a pending, unexpired invitation exists for this email,
 * provisioning is skipped entirely — `auth.api.acceptInvitation` (called
 * from `/invitations/[id]/accept`) creates the Member row and sets the
 * active organization itself once the invitation is actually accepted.
 */
export async function provisionTenantForNewUser(
  userId: string,
): Promise<{ organizationId: string } | { organizationId: null }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const pendingInvitation = await prisma.invitation.findFirst({
    where: { email: user.email, status: "pending", expiresAt: { gt: new Date() } },
  });
  if (pendingInvitation) {
    return { organizationId: null };
  }

  const slug = await generatePlaceholderSlug();
  const now = new Date();

  const organization = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        id: crypto.randomUUID(),
        name: "Unnamed Business",
        slug,
        status: "ACTIVE",
        createdAt: now,
      },
    });

    await tx.member.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: org.id,
        userId,
        role: "owner",
        createdAt: now,
      },
    });

    return org;
  });

  await audit({
    organizationId: organization.id,
    actorUserId: userId,
    action: "tenant.create",
    recordType: "Organization",
    recordId: organization.id,
    after: JSON.parse(JSON.stringify(organization)),
  });

  const trialPlan = await ensureTrialPlan();
  await assignPlan(organization.id, trialPlan.id, userId);

  return { organizationId: organization.id };
}
