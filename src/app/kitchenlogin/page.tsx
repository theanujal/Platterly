import type { Metadata } from "next";
import { headers as nextHeaders } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import { AuthGate } from "./_components/auth-gate";
import { OnboardingWizard } from "./_components/onboarding-wizard";
import { OnboardingComplete } from "./_components/onboarding-complete";

// Chunk 4 — Caterer/Kitchen Admin sign-in, sign-up, and the 5-step
// onboarding wizard, all served at the reserved `/kitchenlogin` path from
// Chunk 1 Group 1.4.
export const metadata: Metadata = {
  title: "Sign in — Platterly",
  robots: { index: false, follow: false },
};

export default async function KitchenAdminLoginPage() {
  const session = await auth.api.getSession({ headers: await nextHeaders() });

  if (!session) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <AuthGate />
      </main>
    );
  }

  let organizationId = session.session.activeOrganizationId;
  if (!organizationId) {
    // A fresh sign-in's session starts with no active organization — Better
    // Auth doesn't auto-restore it from an existing Member row (confirmed:
    // no such hook in the organization plugin). So "no active org" alone
    // doesn't mean "still mid-wizard" — check for an existing membership
    // before assuming this is a brand-new signup.
    const membership = await prisma.member.findFirst({ where: { userId: session.user.id } });
    if (!membership) {
      return (
        <main className="flex flex-1 items-center justify-center p-8">
          <OnboardingWizard />
        </main>
      );
    }
    await auth.api.setActiveOrganization({
      body: { organizationId: membership.organizationId },
      headers: await nextHeaders(),
    });
    organizationId = membership.organizationId;
  }

  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  return <OnboardingComplete businessName={organization?.name ?? "your business"} />;
}
