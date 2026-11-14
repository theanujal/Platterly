import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requireActiveOrganization, hasPermission } from "@/lib/auth/require-session";
import { getEntitlements } from "@/modules/ops-link/entitlements";
import { storeManageUrl } from "@/lib/platform/config";
import { SignOutButton } from "@/app/kitchenlogin/_components/sign-out-button";

export const metadata: Metadata = {
  title: "Plan ended — Caterly",
  robots: { index: false, follow: false },
};

const TITLE = {
  trial_ended: "Your free trial has ended",
  period_ended: "Your plan has ended",
  ended: "Your subscription is not active",
} as const;

/**
 * The one page a locked kitchen can reach (a trial or paid period that has run out). Caterly does not take payment: the Business Admin renews in the
 * Platterly Store, and everyone else is told to ask them (AJ, 2026-11-14). No sidebar, only Sign out.
 */
export default async function PlanEndedPage() {
  const { organizationId } = await requireActiveOrganization({ allowLocked: true });
  const [entitlements, canRenew] = await Promise.all([getEntitlements(organizationId), hasPermission({ tenant: ["edit"] }, organizationId)]);
  if (!entitlements.locked) redirect("/dashboard");

  return (
    <div className="relative min-h-svh bg-accent/60">
      <div className="absolute top-4 right-4 sm:top-5 sm:right-6">
        <SignOutButton variant="outline" size="md" />
      </div>
      <main className="mx-auto flex min-h-svh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center" role="status">
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="plan-ended-title">
          {TITLE[entitlements.lockReason ?? "ended"]}
        </h1>
        {canRenew ? (
          <>
            <p className="text-base text-muted-foreground">Renew in the Platterly Store to get back into your account. Everything you built is safe and waiting.</p>
            <Button size="lg" render={<a href={storeManageUrl()} />} nativeButton={false} data-testid="renew-in-store">
              Renew in the Store
            </Button>
          </>
        ) : (
          <p className="text-base text-muted-foreground" data-testid="ask-your-admin">
            Ask your Admin to renew the plan. Everything you built is safe and waiting.
          </p>
        )}
      </main>
    </div>
  );
}
