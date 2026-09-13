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
 */
export async function provisionTenantForNewUser(userId: string): Promise<{ organizationId: string }> {
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
