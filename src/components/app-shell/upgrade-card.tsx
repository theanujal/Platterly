import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UpgradeCardProps {
  planName: string;
  isTrialing: boolean;
  trialDaysLeft: number | null;
}

// Compact upgrade nudge above the account/sign-out footer. Deliberately
// reuses the exact card treatment already established by
// OnboardingNudgeBanner (rounded-xl, accent bg, accent-foreground border/
// text) rather than inventing a new "promo" look. Links to the real
// Subscription settings page — the only place plan/limit info actually
// lives today; there's no self-serve checkout yet, so this never claims one.
export function UpgradeCard({ planName, isTrialing, trialDaysLeft }: UpgradeCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-accent-foreground/15 bg-accent p-3">
      <div className="flex items-center gap-1.5 text-accent-foreground">
        <Sparkles className="size-3.5 shrink-0" />
        <span className="text-xs font-semibold">{isTrialing ? "You're on a free trial" : `${planName} plan`}</span>
      </div>
      <p className="text-xs leading-snug text-accent-foreground/80">
        {isTrialing && trialDaysLeft !== null
          ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left. Upgrade to keep every feature after your trial ends.`
          : "Unlock higher limits and more team seats on a bigger plan."}
      </p>
      <Button size="sm" className="w-full" render={<Link href="/settings/subscription" />} nativeButton={false}>
        Upgrade Now
      </Button>
    </div>
  );
}
