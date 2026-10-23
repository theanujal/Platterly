import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireActiveOrganization, hasPermission } from "@/lib/auth/require-session";
import { getSubscribeData } from "@/modules/subscriptions/billing-source";
import { opsBillingOn } from "@/modules/ops-link/config";
import { SignOutButton } from "@/app/kitchenlogin/_components/sign-out-button";
import { SubscribeClient } from "./_components/subscribe-client";

export const metadata: Metadata = {
  title: "Choose a plan — Caterly",
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
      {/* A locked kitchen can reach nothing else, so Back is only offered once the account is open. */}
      {!data.locked && (
        <div className="absolute top-4 left-4 sm:top-5 sm:left-6">
          <Button variant="outline" size="md" render={<Link href="/dashboard" />} nativeButton={false}>
            <ArrowLeft /> Back
          </Button>
        </div>
      )}
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
          autoPayBilling={opsBillingOn()}
          current={
            paid
              ? { planId: paid.planId, planName: paid.planName, priceMonthly: paid.priceMonthly ?? 0, periodEnd: paid.currentPeriodEnd?.toISOString() ?? null, pendingPlanName: paid.pendingPlanName, pendingInterval: paid.pendingInterval, autoPay: paid.autoPay ? { status: paid.autoPay.status, nextChargeAt: paid.autoPay.nextChargeAt?.toISOString() ?? null } : null }
              : null
          }
        />
      )}
    </div>
  );
}
