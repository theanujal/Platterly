"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CopyButtonProps {
  value: string;
  label?: string;
  /** Defaults to "sm" for page-level use; pass "md" when this renders inside a Card. */
  size?: "sm" | "md";
  /** Icon only (no text). `label` becomes the tooltip and accessible name. */
  iconOnly?: boolean;
}

// Small, generic "copy this to the clipboard" control — not tied to the
// storefront link specifically, so any future screen needing the same
// pattern (e.g. a QR/secure-access link) can reuse it as-is.
export function CopyButton({ value, label = "Copy", size = "sm", iconOnly = false }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? "icon-sm" : size}
      onClick={handleCopy}
      aria-label={iconOnly ? (copied ? "Copied" : label) : undefined}
      title={iconOnly ? (copied ? "Copied!" : label) : undefined}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {!iconOnly && (copied ? "Copied!" : label)}
    </Button>
  );
}
