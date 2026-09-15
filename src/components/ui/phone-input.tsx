"use client";

import "react-phone-number-input/style.css";
import PhoneInputWithCountrySelect from "react-phone-number-input";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

interface PhoneInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Country-flag dropdown + number field (AJ's explicit ask, 2026-09-16).
 * `react-phone-number-input` renders its own flag/country-select and hands
 * the text field to `inputComponent` — reusing this app's shared `Input` so
 * the field itself matches every other text input; the border/rounding
 * lives on the outer row instead (the input goes borderless) so the two
 * pieces read as one control, matching this library's standard shadcn
 * integration pattern.
 */
export function PhoneInput({ id, value, onChange, required, disabled, className }: PhoneInputProps) {
  return (
    <PhoneInputWithCountrySelect
      id={id}
      international
      defaultCountry="IN"
      value={value}
      onChange={(v) => onChange(v ?? "")}
      required={required}
      disabled={disabled}
      inputComponent={Input}
      numberInputProps={{ className: "h-8 rounded-none border-0 px-1.5 shadow-none focus-visible:ring-0" }}
      className={cn(
        "flex h-10 items-center gap-1.5 rounded-lg border border-input bg-transparent pl-2.5 has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50",
        className,
      )}
    />
  );
}
