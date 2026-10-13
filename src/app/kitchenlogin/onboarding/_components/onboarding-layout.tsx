import { ChefHat } from "lucide-react";
import { OnboardingStageList } from "./onboarding-stage-list";
import type { StageStatus } from "./types";

interface OnboardingLayoutProps {
  steps: { label: string; status: StageStatus }[];
  children: React.ReactNode;
}

// Split-screen onboarding shell (AJ's spec, points 1/5) — a dedicated
// layout, not a reuse of kitchenlogin's AuthLayout: the left panel here is
// a live, per-step progress list that re-renders on every step change,
// unlike AuthLayout's static marketing bullets, so sharing one component
// would need a variant prop for no real benefit. Same brand gradient
// treatment as AuthLayout for visual consistency across /kitchenlogin/*.
export function OnboardingLayout({ steps, children }: OnboardingLayoutProps) {
  return (
    <div className="flex min-h-svh w-full flex-col md:flex-row">
      <div className="hidden flex-col justify-between gap-10 bg-gradient-to-br from-primary to-[#9a3412] px-10 py-12 text-primary-foreground md:flex md:w-1/2">
        <div className="flex items-center gap-2 text-lg font-bold">
          <ChefHat className="size-8 shrink-0 text-white" strokeWidth={1.75} aria-hidden />
          Caterly
          <span className="text-xs font-medium text-primary-foreground/80">by Platterly</span>
        </div>
        <OnboardingStageList steps={steps} />
      </div>
      {/* Constrained content area (spec point 5) — the form never stretches full-width even on a wide right panel. */}
      <main className="flex flex-1 items-center justify-center bg-muted p-6 md:p-8">
        <div className="flex w-full max-w-lg flex-col gap-10">{children}</div>
      </main>
    </div>
  );
}
