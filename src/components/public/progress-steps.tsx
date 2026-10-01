import { Check } from "lucide-react";
import { cn } from "cn";

/**
 * A plain (non-clickable) step indicator for a public page that moves through stages on one link, such as the
 * menu-approval link: Review & Approve, Venue & Delivery, Confirmation. Same look as the storefront's WizardStepper
 * (numbered circles, a check once done, labels from `sm` up), but driven by props instead of a draft.
 */
export function ProgressSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <nav aria-label="Progress" className="flex items-center justify-center gap-1.5 sm:gap-3">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <div key={label} className="flex items-center gap-1.5 sm:gap-3">
            <div className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
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
              <span className={cn("hidden text-xs sm:inline", active ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
              {active && <span className="sr-only sm:hidden">{label}</span>}
            </div>
            {index < steps.length - 1 && <span className="h-px w-3 bg-border sm:w-6" />}
          </div>
        );
      })}
    </nav>
  );
}
