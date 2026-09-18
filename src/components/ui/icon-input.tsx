import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

/**
 * Left-icon wrapper for `Input` (AJ, 2026-09-19) — promoted from
 * `kitchenlogin/_components/icon-input.tsx` (where it started as an
 * auth-only pattern) so Customer/Item/Event forms can reuse it too, instead
 * of each form hand-rolling its own icon-in-field markup.
 */
export function IconInput({ icon: Icon, className, ...props }: ComponentProps<typeof Input> & { icon: LucideIcon }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={cn("h-10 rounded-lg pl-8", className)} {...props} />
    </div>
  );
}
