import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "You're all set — Platterly",
  robots: { index: false, follow: false },
};

// Dedicated completion route (AJ's spec, point 10) — a genuinely distinct
// confirmation screen, not the wizard's split-screen form shell. Reached
// only via the wizard's own router.push() after completeOnboardingAction
// has already resolved, so — unlike onboarding/page.tsx's own
// same-route-re-render race (see that file's comment) — checking
// onboardingCompletedAt here is safe: this is a fresh navigation to a
// different route, not an implicit re-render of the action's invoking page.
export default async function OnboardingCompletePage() {
  const { organizationId } = await requireActiveOrganization();
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

  if (!organization.onboardingCompletedAt) {
    redirect("/kitchenlogin/onboarding");
  }

  return (
    <main className="flex min-h-svh w-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold">Your Platterly account is ready!</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        You can now start managing your orders, inventory, and grow your catering business.
      </p>
      <Button
        className="px-8 text-base font-semibold"
        render={<Link href="/dashboard" />}
        nativeButton={false}
      >
        Take me to my Dashboard
      </Button>
    </main>
  );
}
