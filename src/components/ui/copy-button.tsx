"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

interface CopyButtonProps {
  value: string;
  label?: string;
  /** Defaults to "sm" for page-level use; pass "md" when this renders inside a Card. */
  size?: "sm" | "md";
  /** Icon only (no text). `label` becomes the tooltip and accessible name. */
  iconOnly?: boolean;
  className?: string;
}

// Small, generic "copy this to the clipboard" control — not tied to the
// storefront link specifically, so any future screen needing the same
// pattern (e.g. a QR/secure-access link) can reuse it as-is.
export function CopyButton({ value, label = "Copy", size = "sm", iconOnly = false, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const button = (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? (size === "md" ? "md" : "icon-sm") : size}
      onClick={handleCopy}
      className={cn(iconOnly && size === "md" && "w-[38px] px-0", className)}
      aria-label={iconOnly ? (copied ? "Copied" : label) : undefined}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {!iconOnly && (copied ? "Copied!" : label)}
    </Button>
  );
  // A click closes a plain tooltip, so keep it open while "Copied!" shows.
  return iconOnly ? (
    <Tooltip open={hovered || copied} onOpenChange={setHovered}>
      <TooltipTrigger delay={300} render={button} />
      <TooltipContent>{copied ? "Copied!" : label}</TooltipContent>
    </Tooltip>
  ) : (
    button
  );
}
