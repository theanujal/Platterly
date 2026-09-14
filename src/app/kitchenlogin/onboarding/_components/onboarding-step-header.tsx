interface OnboardingStepHeaderProps {
  stepIndicator: string;
  heading: string;
  supportingText?: string;
}

// Enforces the fixed per-screen structure every onboarding step follows
// (AJ's spec, point 4): step indicator -> heading -> supporting info,
// always above the step's own interaction. One component so no step can
// drift from this order.
export function OnboardingStepHeader({ stepIndicator, heading, supportingText }: OnboardingStepHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{stepIndicator}</span>
      <h1 className="text-2xl font-bold">{heading}</h1>
      {supportingText && <p className="text-sm text-muted-foreground">{supportingText}</p>}
    </div>
  );
}
