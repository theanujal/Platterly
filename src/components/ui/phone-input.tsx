"use client";

import "react-phone-number-input/style.css";
import PhoneInputWithCountrySelect from "react-phone-number-input";
import { isValidPhoneNumber } from "react-phone-number-input/max";
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
 * Country-flag + number field (AJ's explicit ask, 2026-09-16); country
 * selectable, calling code not editable, digits only, per-country length
 * (2026-09-25).
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
      // Any country can be picked (AJ, 2026-09-25), but the calling code
      // itself is frozen — the visitor only types the national number, and
      // the length limit follows the selected country (10 digits for India,
      // 11 for China, ...), not a fixed number.
      countryCallingCodeEditable={false}
      limitMaxLength
      value={value}
      onChange={(v) => onChange(v ?? "")}
      required={required}
      disabled={disabled}
      inputComponent={Input}
      numberInputProps={{
        className: "h-8 rounded-none border-0 px-0 shadow-none focus-visible:ring-0",
        // The country's own length rule (not a fixed 10): once the number is
        // already a complete, valid number for the selected country, one more
        // digit that would make it invalid is refused — so India stops at 10,
        // China at 11, while countries whose valid numbers vary in length can
        // still grow through their valid lengths. `limitMaxLength` above is the
        // backstop for pastes and keyboards that don't report a digit.
        onBeforeInput: (event: React.FormEvent<HTMLInputElement>) => {
          const digit = (event.nativeEvent as InputEvent).data ?? "";
          if (!/^\d$/.test(digit)) return;
          const input = event.currentTarget;
          if (input.selectionStart !== input.value.length || input.selectionEnd !== input.value.length) return;
          if (value && isValidPhoneNumber(value) && !isValidPhoneNumber(value + digit)) event.preventDefault();
        },
      }}
      className={cn(
        // The flag and chevron are sized and toned like the leading icon of the other fields (16px, muted), and the
        // text starts where an IconInput's text does, so a phone field sits in a form like its neighbours.
        "flex h-10 items-center gap-2 rounded-lg border border-input bg-transparent px-3 [--PhoneInputCountryFlag-borderColor:rgb(0_0_0/0.12)] [--PhoneInputCountryFlag-height:0.8125rem] [--PhoneInputCountrySelectArrow-color:var(--color-muted-foreground)] [--PhoneInputCountrySelectArrow-opacity:0.9] has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50",
        className,
      )}
    />
  );
}
