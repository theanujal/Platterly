import Link from "next/link";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";

// Chunk 4/5 — shown on every Dashboard visit until the caterer finishes (or
// explicitly skipped and never returned to) the onboarding wizard. Points
// at Settings, not back at the one-time wizard — Settings has the same
// fields. Only one call site exists, so this stays a bespoke banner rather
// than a generic components/ui/ primitive until a second consumer needs one.
export function OnboardingNudgeBanner() {
  return (
    <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-accent-foreground/15 bg-accent px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex items-start gap-2.5">
        <Info className="mt-0.5 size-4 shrink-0 text-accent-foreground" />
        <p className="text-sm text-accent-foreground">
          Your business profile isn&apos;t finished yet. Complete it to get the most out of Platterly.
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 border-accent-foreground/25 bg-transparent text-accent-foreground hover:bg-accent-foreground/10"
        render={<Link href="/settings" />}
        nativeButton={false}
      >
        Finish your profile
      </Button>
    </div>
  );
}
