import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UpgradeCardProps {
  planName: string;
  isTrialing: boolean;
  trialDaysLeft: number | null;
  trialTotalDays: number | null;
}

/**
 * Compact upgrade nudge above the account/sign-out footer. Deliberately its
 * own bolder treatment now (AJ, 2026-09-19) rather than the quiet
 * OnboardingNudgeBanner tint it used to reuse — orange is already the
 * accent for nearly everything else in the sidebar (nav, active states,
 * primary buttons), so reusing it again here just blends this card into
 * its surroundings instead of making it stand out. Success green is the
 * one accent nothing else in the sidebar uses. Links to the real
 * Subscription settings page — the only place plan/limit info actually
 * lives today; there's no self-serve checkout yet, so this never claims one.
 */
export function UpgradeCard({ planName, isTrialing, trialDaysLeft, trialTotalDays }: UpgradeCardProps) {
  const progressPercent =
    isTrialing && trialDaysLeft !== null && trialTotalDays
      ? Math.min(100, Math.max(0, ((trialTotalDays - trialDaysLeft) / trialTotalDays) * 100))
      : null;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-gradient-to-br from-success to-success/85 p-3 text-white">
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 shrink-0" />
        <span className="text-xs font-semibold">
          {isTrialing && trialDaysLeft !== null
            ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left on your trial`
            : isTrialing
              ? "You're on a free trial"
              : `${planName} plan`}
        </span>
      </div>
      {progressPercent !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white" style={{ width: `${progressPercent}%` }} />
        </div>
      )}
      <p className="text-xs leading-snug text-white/90">
        {isTrialing
          ? "Upgrade to keep every feature after your trial ends."
          : "Unlock higher limits and more team seats on a bigger plan."}
      </p>
      {/*
        size="md" (h-[38px]) — formalized 2026-09-19 as a real Button size
        (button.tsx) instead of a one-off className override; this was the
        button that originally established the 38px value (design doc
        section 08, "Trial Upsell Card"). Standing rule: any button inside a
        card uses size="md".
      */}
      <Button
        size="md"
        className="w-full bg-white text-success hover:bg-white/90"
        render={<Link href="/settings/subscription" />}
        nativeButton={false}
      >
        Upgrade Now
      </Button>
    </div>
  );
}
