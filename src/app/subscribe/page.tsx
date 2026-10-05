import type { Metadata } from "next";
import { requireActiveOrganization, hasPermission } from "@/lib/auth/require-session";
import { getSubscribeData } from "@/modules/subscriptions/billing-source";
import { SignOutButton } from "@/app/kitchenlogin/_components/sign-out-button";
import { SubscribeClient } from "./_components/subscribe-client";

export const metadata: Metadata = {
  title: "Choose a plan — Platterly",
  robots: { index: false, follow: false },
};

/**
 * Chunk 20: the one page a locked kitchen can reach (a trial or paid period that has run out), and where anyone
 * goes to upgrade or renew. It sits outside the `(app)` shell on purpose: no sidebar, only Sign out, because a
 * locked kitchen sees nothing else until it pays.
 */
export default async function SubscribePage() {
  const { organizationId } = await requireActiveOrganization({ allowLocked: true });
  const [data, canPay] = await Promise.all([getSubscribeData(organizationId), hasPermission({ tenant: ["edit"] }, organizationId)]);
  const { plans } = data;
  const current = data.subscription;
  const paid = current?.status === "ACTIVE" && !data.locked ? current : null;

  return (
    <div className="relative min-h-svh bg-accent/60">
      <div className="absolute top-4 right-4 sm:top-5 sm:right-6">
        <SignOutButton variant="outline" size="md" />
      </div>
      {data.unavailable ? (
        <div className="mx-auto flex min-h-svh max-w-lg flex-col items-center justify-center gap-3 px-6 text-center" role="status">
          <h1 className="text-xl font-semibold">Billing is not available right now</h1>
          <p className="text-sm text-muted-foreground">We could not load the plans. Please try again in a few minutes. Everything you built is safe.</p>
        </div>
      ) : (
        <SubscribeClient
          plans={plans}
          locked={data.locked}
          lockReason={data.lockReason}
          canPay={canPay}
          onlineBilling={data.onlineBilling}
          current={
            paid
              ? { planId: paid.planId, planName: paid.planName, priceMonthly: paid.priceMonthly ?? 0, periodEnd: paid.currentPeriodEnd?.toISOString() ?? null, pendingPlanName: paid.pendingPlanName, pendingInterval: paid.pendingInterval }
              : null
          }
        />
      )}
    </div>
  );
}
