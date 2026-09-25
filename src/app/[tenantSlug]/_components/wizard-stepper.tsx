import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "cn";
import { WIZARD_STEPS, type WizardStepKey } from "@/modules/menu-approvals/storefront-draft-constants";

interface WizardStepperProps {
  tenantSlug: string;
  draftId: string;
  current: WizardStepKey;
  /** The furthest step the visitor has unlocked (1-based) — earlier steps stay clickable. */
  reachedStep: number;
}

export function WizardStepper({ tenantSlug, draftId, current, reachedStep }: WizardStepperProps) {
  const currentIndex = WIZARD_STEPS.findIndex((s) => s.key === current);
  return (
    <nav aria-label="Progress" className="flex items-center justify-center gap-1.5 sm:gap-3">
      {WIZARD_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        const reachable = index < reachedStep && !active;
        const circle = (
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              active && "bg-primary text-primary-foreground",
              done && "bg-success text-white",
              !active && !done && "bg-muted text-muted-foreground",
            )}
          >
            {done ? <Check className="size-4" /> : index + 1}
          </span>
        );
        const label = <span className={cn("hidden text-xs sm:inline", active ? "font-semibold text-foreground" : "text-muted-foreground")}>{step.label}</span>;
        return (
          <div key={step.key} className="flex items-center gap-1.5 sm:gap-3">
            {reachable ? (
              <Link href={`/${tenantSlug}/plan/${draftId}?step=${step.key}`} className="flex items-center gap-2" aria-label={`Back to ${step.label}`}>
                {circle}
                {label}
              </Link>
            ) : (
              <div className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
                {circle}
                {label}
              </div>
            )}
            {index < WIZARD_STEPS.length - 1 && <span className="h-px w-3 bg-border sm:w-6" />}
          </div>
        );
      })}
    </nav>
  );
}
