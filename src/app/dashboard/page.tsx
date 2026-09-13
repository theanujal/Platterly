import type { Metadata } from "next";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { SignOutButton } from "../kitchenlogin/_components/sign-out-button";
import { OnboardingNudgeBanner } from "./_components/onboarding-nudge-banner";
import { CustomLinkDialog } from "./_components/custom-link-dialog";

export const metadata: Metadata = {
  title: "Dashboard — Platterly",
  robots: { index: false, follow: false },
};

// Minimal caterer-facing dashboard shell. Real modules (events, orders,
// kitchen, etc.) land in later chunks — this exists now so the redesigned
// signup/onboarding flow has a real place to land.
export default async function DashboardPage() {
  const { organizationId } = await requireActiveOrganization();
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Welcome, {organization.name}</h1>
          <p className="text-sm text-muted-foreground">Your catering business dashboard.</p>
        </div>
        <SignOutButton />
      </div>
      {!organization.onboardingCompletedAt && <OnboardingNudgeBanner />}
      <CustomLinkDialog currentSlug={organization.slug} defaultOpen={organization.slugChangeCount === 0} />
    </main>
  );
}
