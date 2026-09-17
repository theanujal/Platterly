"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon } from "lucide-react";
import { cn } from "cn";

interface ActiveToggleCardProps {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Defaults to "Active" — pass "Active (visible to customers)" for catalog entities that feed the public storefront/menu selection. */
  label?: string;
}

/** Full-width status card per AJ's reference screenshots (2026-09-17) — emerald when Active, muted gray when Inactive. Reused across every catalog Add/Edit popup's Active checkbox. */
export function ActiveToggleCard({ id, checked, onCheckedChange, label = "Active" }: ActiveToggleCardProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors",
        checked ? "border-emerald-200 bg-emerald-50" : "border-border bg-muted",
      )}
    >
      <CheckboxPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-input bg-background",
        )}
      >
        <CheckboxPrimitive.Indicator className="grid place-content-center text-current transition-none [&>svg]:size-3.5">
          <CheckIcon />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {/* text-sm font-medium — matches this app's shared Label component exactly, not a bespoke size/weight. */}
      <span className="text-sm font-medium text-foreground">{label}</span>
    </label>
  );
}
