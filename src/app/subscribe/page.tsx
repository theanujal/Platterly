import type { Metadata } from "next";
import { requireActiveOrganization, hasPermission } from "@/lib/auth/require-session";
import { getBillingState, listSellablePlans, onlineBillingAvailable } from "@/modules/subscriptions/billing";
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
  const [state, plans, canPay] = await Promise.all([getBillingState(organizationId), listSellablePlans(), hasPermission({ tenant: ["edit"] }, organizationId)]);
  const current = state.subscription;
  const paid = current?.status === "ACTIVE" && !state.locked ? current : null;
  const pendingPlan = paid?.pendingPlanId ? plans.find((plan) => plan.id === paid.pendingPlanId) : undefined;

  return (
    <div className="relative min-h-svh bg-accent/60">
      <div className="absolute top-4 right-4 sm:top-5 sm:right-6">
        <SignOutButton variant="outline" size="md" />
      </div>
      <SubscribeClient
        plans={plans}
        locked={state.locked}
        lockReason={state.lockReason}
        canPay={canPay}
        onlineBilling={onlineBillingAvailable()}
        current={
          paid
            ? { planId: paid.subscriptionPlanId, planName: paid.subscriptionPlan.name, priceMonthly: Number(paid.subscriptionPlan.priceMonthly ?? 0), periodEnd: paid.currentPeriodEnd?.toISOString() ?? null, pendingPlanName: pendingPlan?.name ?? null, pendingInterval: paid.pendingInterval }
            : null
        }
      />
    </div>
  );
}
