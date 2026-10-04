import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UpgradeCardProps {
  trialDaysLeft: number | null;
  trialTotalDays: number | null;
}

export interface SidebarNotice {
  title: string | null;
  message: string | null;
  buttonLabel: string | null;
  buttonUrl: string | null;
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
export function UpgradeCard({ trialDaysLeft, trialTotalDays }: UpgradeCardProps) {
  const progressPercent =
    trialDaysLeft !== null && trialTotalDays
      ? Math.min(100, Math.max(0, ((trialTotalDays - trialDaysLeft) / trialTotalDays) * 100))
      : null;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-gradient-to-br from-success to-success/85 p-3 text-white">
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 shrink-0" />
        <span className="text-xs font-semibold">
          {trialDaysLeft !== null ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left on your trial` : "You're on a free trial"}
        </span>
      </div>
      {progressPercent !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white" style={{ width: `${progressPercent}%` }} />
        </div>
      )}
      <p className="text-xs leading-snug text-white/90">
        Upgrade to keep every feature after your trial ends.
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
        render={<Link href="/subscribe" />}
        nativeButton={false}
      >
        Upgrade Now
      </Button>
    </div>
  );
}

/**
 * The Super Admin's own words in the same green box (AJ, 2026-10-04): a title, some text and an optional button that
 * opens a page in Platterly or a secure outside address. Shown to every kitchen while it is switched on.
 */
export function NoticeBox({ notice }: { notice: SidebarNotice }) {
  const external = notice.buttonUrl?.startsWith("https://") ?? false;
  return (
    <div data-testid="sidebar-notice" className="flex flex-col gap-2.5 rounded-xl bg-gradient-to-br from-success to-success/85 p-3 text-white">
      {notice.title && (
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 shrink-0" />
          <span className="text-xs font-semibold">{notice.title}</span>
        </div>
      )}
      {notice.message && <p className="text-xs leading-snug whitespace-pre-line text-white/90">{notice.message}</p>}
      {notice.buttonLabel && notice.buttonUrl && (
        <Button
          size="md"
          className="w-full bg-white text-success hover:bg-white/90"
          render={external ? <a href={notice.buttonUrl} target="_blank" rel="noopener noreferrer" /> : <Link href={notice.buttonUrl} />}
          nativeButton={false}
        >
          {notice.buttonLabel}
        </Button>
      )}
    </div>
  );
}
