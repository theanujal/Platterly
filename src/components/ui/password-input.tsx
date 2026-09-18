"use client";

import { useState, type ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

/**
 * Left-icon input with a trailing show/hide toggle (AJ, 2026-09-19) —
 * promoted from `kitchenlogin/_components/icon-input.tsx` (auth-only
 * originally) so Settings' password forms can reuse it too. A sibling to
 * `IconInput` rather than one of its options, since the trailing-icon slot
 * only ever makes sense for a password field.
 */
export function PasswordInput({ icon: Icon, className, ...props }: ComponentProps<typeof Input> & { icon: LucideIcon }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input type={visible ? "text" : "password"} className={cn("h-10 rounded-lg px-8", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
