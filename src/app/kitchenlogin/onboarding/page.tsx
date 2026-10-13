import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers as nextHeaders } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { OnboardingWizard } from "./_components/onboarding-wizard";

export const metadata: Metadata = {
  title: "Set up your business — Caterly",
  robots: { index: false, follow: false },
};

// One-time onboarding wizard entry point — reached only via the sign-up
// form's post-success redirect. Never linked to from anywhere else in the
// app (see src/app/kitchenlogin/page.tsx and the Dashboard's nudge banner,
// which points at /settings instead), so a caterer only ever sees this once
// in the ordinary flow.
//
// Deliberately does NOT redirect away when onboarding is already complete:
// `completeOnboardingAction` is a Server Action called from this same route,
// and Next.js re-renders the invoking route's Server Component as part of
// that call's response — a redirect-if-complete check here would fire the
// instant the action sets `onboardingCompletedAt`, preempting the wizard's
// own client-side "done" screen before the user ever sees it. The wizard
// itself owns that transition (see its `screen` state).
export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  if (!session) {
    redirect("/");
  }
  if (!session.user.emailVerified) {
    redirect("/kitchenlogin/verify-email?next=/kitchenlogin/onboarding");
  }

  const { organizationId } = await requireActiveOrganization();

  // Once the wizard has been finished or skipped it is never shown again, so Back from the Dashboard (or an old link)
  // lands on the Dashboard instead. The finished screen is a separate route, so this redirect cannot cut it short.
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { onboardingCompletedAt: true, onboardingDismissedAt: true } });
  if (organization.onboardingCompletedAt || organization.onboardingDismissedAt) {
    redirect("/dashboard");
  }

  return (
    <OnboardingWizard
      accountHolderFirstName={session.user.firstName ?? ""}
      accountHolderLastName={session.user.lastName ?? ""}
      signUpPhone={(session.user as { phone?: string | null }).phone ?? ""}
    />
  );
}
