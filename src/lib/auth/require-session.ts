import "server-only";
import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma } from "@/lib/db";
import { provisionTenantForNewUser } from "@/modules/tenants/auto-provision";
import type { statement } from "./permissions";

export class UnauthenticatedError extends Error {}
export class ForbiddenError extends Error {}

/**
 * Tenant-isolation + auth core (Chunk 1 Group 1.3, PRD §54). Deliberately a
 * plain server-side helper called at the top of protected Server
 * Components/route handlers — NOT global Next.js Edge middleware. Better
 * Auth's Prisma adapter needs the Node.js runtime, and Edge middleware runs
 * on the Edge runtime by default, so keeping tenant/permission checks here
 * avoids that conflict entirely.
 */
export async function requireSession() {
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  if (!session) {
    throw new UnauthenticatedError("No active session");
  }
  return session;
}

/**
 * Requires an authenticated session scoped to a specific organization
 * (tenant). Rejects cross-tenant access even for an authenticated user who
 * simply isn't a member of the requested organization — the actual
 * membership check happens inside Better Auth's own adapter query, so a
 * mismatched organizationId can never leak another tenant's data.
 */
export async function requireOrg(organizationId: string) {
  const session = await requireSession();
  if (session.session.activeOrganizationId !== organizationId) {
    throw new ForbiddenError("Session is not scoped to this organization");
  }
  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id, organizationId },
    select: { disabledAt: true },
  });
  if (membership?.disabledAt) {
    throw new ForbiddenError("This account has been disabled by an administrator.");
  }
  return session;
}

/**
 * Session scoped to the caller's own organization, resolving/setting
 * `activeOrganizationId` from their `Member` row when a fresh sign-in
 * hasn't populated it yet (Better Auth doesn't auto-restore this itself).
 * Every caterer-facing route (`/kitchenlogin`, `/kitchenlogin/onboarding`,
 * `/dashboard`, `/settings`) goes through this instead of duplicating the
 * lookup.
 *
 * The `provisionTenantForNewUser` call is a defensive self-heal, not the
 * primary path: an Organization is normally created via the
 * `databaseHooks.user.create.after` hook at signup (see
 * `auto-provision.ts`), so a membership should always already exist. This
 * only fires if that hook ever failed to run atomically with user creation.
 *
 * Chunk 5 Group 5.2 — two additions on top of the above:
 *  - `provisionTenantForNewUser` now returns `{ organizationId: null }` for
 *    a user with a pending team invitation (see that function's own
 *    comment). When that happens here, there is genuinely no org to fall
 *    back to yet — redirect to the invitation's own accept page rather than
 *    throwing, since this is an expected state, not an error.
 *  - Once an organization IS resolved (either branch), reject with
 *    `ForbiddenError` if the caller's own `Member.disabledAt` is set. This
 *    is the single enforcement point for "a disabled teammate is locked out
 *    of every caterer-facing route," not a check scattered per-page.
 */
export async function requireActiveOrganization() {
  const session = await requireSession();
  let organizationId = session.session.activeOrganizationId;
  let membership: { organizationId: string; disabledAt: Date | null } | null = null;

  if (organizationId) {
    membership = await prisma.member.findFirst({
      where: { userId: session.user.id, organizationId },
      select: { organizationId: true, disabledAt: true },
    });
  } else {
    membership = await prisma.member.findFirst({
      where: { userId: session.user.id },
      select: { organizationId: true, disabledAt: true },
    });
    if (!membership) {
      const provisioned = await provisionTenantForNewUser(session.user.id);
      if (!provisioned.organizationId) {
        const pendingInvitation = await prisma.invitation.findFirst({
          where: { email: session.user.email, status: "pending", expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        });
        if (pendingInvitation) {
          redirect(`/invitations/${pendingInvitation.id}/accept`);
        }
        throw new ForbiddenError("No organization membership found");
      }
      membership = await prisma.member.findFirstOrThrow({
        where: { organizationId: provisioned.organizationId },
        select: { organizationId: true, disabledAt: true },
      });
    }
    await auth.api.setActiveOrganization({
      body: { organizationId: membership.organizationId },
      headers: await nextHeaders(),
    });
    organizationId = membership.organizationId;
  }

  if (membership?.disabledAt) {
    throw new ForbiddenError("This account has been disabled by an administrator.");
  }

  return { session, organizationId };
}

type Statement = typeof statement;

/**
 * Deny-by-default permission check (PRD §15). Resolves against the caller's
 * *active* organization — pass `organizationId` explicitly when checking
 * permissions for an organization other than the active one.
 */
export async function requirePermission<Resource extends keyof Statement>(
  permissions: { [K in Resource]?: Statement[K][number][] },
  organizationId?: string,
) {
  const session = await requireSession();
  const result = await auth.api.hasPermission({
    headers: await nextHeaders(),
    body: {
      organizationId: organizationId ?? session.session.activeOrganizationId ?? undefined,
      permissions,
    },
  });
  if (!result.success) {
    throw new ForbiddenError(result.error ?? "Not authorized");
  }
  return session;
}

/**
 * Same check as `requirePermission`, but returns a boolean instead of
 * throwing (AJ, 2026-09-19) — for deciding whether to *show* something
 * (e.g. a "claim your link" popup) rather than gating access to a whole
 * page/action. Use `requirePermission` when the caller has no fallback UI.
 */
export async function hasPermission<Resource extends keyof Statement>(
  permissions: { [K in Resource]?: Statement[K][number][] },
  organizationId?: string,
): Promise<boolean> {
  const session = await requireSession();
  const result = await auth.api.hasPermission({
    headers: await nextHeaders(),
    body: {
      organizationId: organizationId ?? session.session.activeOrganizationId ?? undefined,
      permissions,
    },
  });
  return result.success;
}

/**
 * Platform-level check for Super Admin-only routes (Chunk 3). A Super Admin
 * has no organization membership — this never touches the access-control
 * engine above.
 */
export async function requireSuperAdmin() {
  const session = await requireSession();
  if (!session.user.isSuperAdmin) {
    throw new ForbiddenError("Super Admin access required");
  }
  return session;
}
