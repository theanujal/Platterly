import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The bar pinned to the bottom of every wizard step, on every screen size (AJ, 2026-10-01; one bar everywhere,
 * 2026-10-10): Back on the left (absent on the first step), an optional summary in the middle, the step's main
 * action on the right. Like a phone app's bottom bar it keeps clear of the home indicator (safe-area inset) and its
 * buttons are full touch-size. A step using it adds `pb-28` to its own root so the last content is never hidden behind it.
 */
export function StepFooter({ onBack, summary, children }: { onBack?: () => void; summary?: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        {onBack ? (
          <Button type="button" size="lg" variant="outline" onClick={onBack}>
            <ArrowLeft /> Back
          </Button>
        ) : (
          <span />
        )}
        {summary && <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-4 gap-y-0.5 text-sm text-muted-foreground">{summary}</div>}
        {children}
      </div>
    </div>
  );
}
