"use client";

import { useState, type ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

// Chunk 4 — thin wrapper adding a left glyph to the auth forms' inputs,
// matching the icon-in-field style captured from MenuMate's auth pages.
// Kept local to /kitchenlogin rather than changing the shared
// components/ui/input.tsx, so Super Admin's forms are unaffected.
export function IconInput({ icon: Icon, className, ...props }: ComponentProps<typeof Input> & { icon: LucideIcon }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={cn("h-10 rounded-lg pl-8", className)} {...props} />
    </div>
  );
}

// Same left-icon convention as IconInput, plus a trailing show/hide toggle
// (AJ's explicit ask, 2026-09-16) — kept as a sibling rather than an
// `IconInput` option since the trailing-icon slot only ever makes sense for
// a password field.
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
