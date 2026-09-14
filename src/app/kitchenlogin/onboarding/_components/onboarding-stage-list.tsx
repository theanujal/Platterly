import { Check } from "lucide-react";
import { cn } from "cn";
import type { StageStatus } from "./types";

interface OnboardingStageListProps {
  steps: { label: string; status: StageStatus }[];
}

// Persistent left-panel progress indicator (AJ's onboarding-redesign spec,
// points 3/8) — status is recomputed live from the wizard's current step, so
// this re-renders with the right completed/active/pending state on every
// step change without any state of its own.
export function OnboardingStageList({ steps }: OnboardingStageListProps) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-start gap-3">
          <div className="flex flex-col items-center self-stretch">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                step.status === "completed" && "border-white bg-white text-primary",
                step.status === "active" && "border-white bg-transparent text-white",
                step.status === "pending" && "border-white/30 bg-transparent text-white/50",
              )}
            >
              {step.status === "completed" ? <Check className="size-3.5" /> : index + 1}
            </span>
            {index < steps.length - 1 && (
              <span className={cn("my-1 w-px flex-1", step.status === "completed" ? "bg-white" : "bg-white/20")} />
            )}
          </div>
          <span
            className={cn(
              "pb-6 text-sm font-medium",
              step.status === "pending" ? "text-white/50" : "text-white",
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
