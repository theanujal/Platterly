"use client";

import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";
import { cn } from "cn";

function Slot({ char, isActive, hasFakeCaret }: SlotProps) {
  return (
    <div
      className={cn(
        "relative flex size-11 items-center justify-center rounded-lg border border-input bg-transparent text-lg font-semibold",
        isActive && "z-10 border-ring ring-2 ring-ring/30",
      )}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-px animate-pulse bg-foreground" />
        </div>
      )}
    </div>
  );
}

/** 6-digit verification code input — input-otp's raw OTPInput primitive, styled to match this app's Input look. */
export function InputOTP({
  id,
  value,
  onChange,
  maxLength = 6,
  disabled,
  autoFocus,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <OTPInput
      id={id}
      value={value}
      onChange={onChange}
      maxLength={maxLength}
      disabled={disabled}
      autoFocus={autoFocus}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      containerClassName="flex items-center gap-2 has-disabled:opacity-50"
      render={({ slots }) => (
        <div className="flex gap-2">
          {slots.map((slot, index) => (
            <Slot key={index} {...slot} />
          ))}
        </div>
      )}
    />
  );
}
