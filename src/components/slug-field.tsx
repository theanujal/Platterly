"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "cn";
import { MAX_SLUG_LENGTH, SLUG_PATTERN, storefrontLinkPrefix } from "@/modules/tenants/slug-rules";

/**
 * The kitchen link field (AJ, 2026-10-14): the real address in front of the box, what is allowed, and how much of the
 * limit is used, so the field never just stops accepting letters without saying why. Shared by the Dashboard pop-up and
 * Settings > Integration > Public menu link.
 */
export function SlugField({ id, label = "Your kitchen link", value, onChange }: { id: string; label?: string; value: string; onChange: (value: string) => void }) {
  const badCharacters = value.length > 0 && !SLUG_PATTERN.test(value);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className={cn("flex h-10 overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50", badCharacters && "border-destructive")}>
        <span className="flex shrink-0 items-center bg-muted px-3 text-sm text-foreground/80" data-testid="slug-prefix">
          {storefrontLinkPrefix()}
        </span>
        <Input
          id={id}
          maxLength={MAX_SLUG_LENGTH}
          value={value}
          placeholder="your-kitchen-name"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={badCharacters || undefined}
          aria-describedby={`${id}-hint`}
          onChange={(event) => onChange(event.target.value.trim())}
          className="h-full rounded-none border-0 focus-visible:ring-0"
        />
      </div>
      <div id={`${id}-hint`} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className={cn(badCharacters && "text-destructive")}>Only letters, numbers, hyphens, and underscores allowed</span>
        <span data-testid="slug-count" className={cn("shrink-0 tabular-nums", value.length >= MAX_SLUG_LENGTH && "font-medium text-foreground")}>
          {value.length}/{MAX_SLUG_LENGTH}
        </span>
      </div>
    </div>
  );
}
