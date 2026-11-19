import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers as nextHeaders } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import { PLATFORM_PROVIDER_ID } from "@/lib/platform/config";
import { consumePendingMembership } from "@/modules/platform-link/pending";
import { AuthLayout } from "../_components/auth-layout";
import { SignOutButton } from "../_components/sign-out-button";

export const metadata: Metadata = { title: "Setting up your account — Caterly", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** How many 3-second looks before the page stops and says it is taking longer than usual (about a minute). */
const LOOKS = 20;

/**
 * Single sign-up (AJ, 2026-11-14): the business is made by the Account and handed to Caterly. A person who arrives before it has landed waits here; the page looks
 * again every 3 seconds, joins the business as soon as it is there and goes on to onboarding (or the dashboard if that was already done).
 */
export default async function SettingUpPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  if (!session) redirect("/");
  let member = await prisma.member.findFirst({ where: { userId: session.user.id }, select: { organizationId: true } });
  if (!member) {
    const central = await prisma.account.findFirst({ where: { userId: session.user.id, providerId: PLATFORM_PROVIDER_ID }, select: { accountId: true } });
    if (central && (await consumePendingMembership(session.user.id, central.accountId))) member = await prisma.member.findFirst({ where: { userId: session.user.id }, select: { organizationId: true } });
  }
  if (member) {
    const org = await prisma.organization.findUnique({ where: { id: member.organizationId }, select: { onboardingCompletedAt: true, onboardingDismissedAt: true } });
    redirect(org && !org.onboardingCompletedAt && !org.onboardingDismissedAt ? "/kitchenlogin/onboarding" : "/dashboard");
  }
  const raw = (await searchParams)?.n;
  const looks = Math.max(0, Math.min(LOOKS, Number(Array.isArray(raw) ? raw[0] : raw) || 0));
  const slow = looks >= LOOKS;
  return (
    <AuthLayout>
      {!slow && <meta httpEquiv="refresh" content={`3;url=/kitchenlogin/setting-up?n=${looks + 1}`} />}
      <h1>Setting up your account</h1>
      <p role="status">
        {slow
          ? // A team invitee is a team member, never an Admin, so no business is made for them. If their invitation was cancelled or ran out, or was sent to another email address,
            // they would wait here for nothing: say what happened and what to do.
            "This is taking longer than usual. If you were invited to join a team, the invitation may have been cancelled, may have expired, or was sent to a different email address than the one you signed up with. Ask your Business Admin to send you a new invitation. Otherwise try again in a moment, or contact Platterly support if it keeps happening."
          : "Just a moment while we finish creating your business…"}
      </p>
      {slow && <Link href="/kitchenlogin/setting-up">Try again</Link>}
      {slow && <SignOutButton />}
    </AuthLayout>
  );
}
