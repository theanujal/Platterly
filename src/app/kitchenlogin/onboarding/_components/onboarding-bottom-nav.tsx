import { Button } from "@/components/ui/button";

interface OnboardingBottomNavProps {
  showBack: boolean;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
  continueLabel: string;
  continueDisabled?: boolean;
  pending?: boolean;
}

// Persistent nav row, identical shape on every step (AJ's spec, point 7):
// Back / Skip-for-now / Continue-or-Complete. Replaces the previous ad-hoc
// per-step `flex justify-between` block plus a separate top-of-page skip link.
export function OnboardingBottomNav({
  showBack,
  onBack,
  onSkip,
  onContinue,
  continueLabel,
  continueDisabled,
  pending,
}: OnboardingBottomNavProps) {
  return (
    <div className="flex items-center justify-between border-t border-border pt-6">
      <Button type="button" variant="outline" disabled={!showBack || pending} onClick={onBack}>
        Back
      </Button>
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
          onClick={onSkip}
        >
          Skip for now
        </button>
        <Button type="button" disabled={continueDisabled || pending} onClick={onContinue}>
          {pending ? "Finishing setup…" : continueLabel}
        </Button>
      </div>
    </div>
  );
}
