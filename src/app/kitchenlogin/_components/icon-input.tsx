import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
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
