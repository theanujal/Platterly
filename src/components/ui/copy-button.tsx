"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CopyButtonProps {
  value: string;
  label?: string;
  /** Defaults to "sm" for page-level use; pass "md" when this renders inside a Card. */
  size?: "sm" | "md";
}

// Small, generic "copy this to the clipboard" control — not tied to the
// storefront link specifically, so any future screen needing the same
// pattern (e.g. a QR/secure-access link) can reuse it as-is.
export function CopyButton({ value, label = "Copy", size = "sm" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" variant="outline" size={size} onClick={handleCopy}>
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "Copied!" : label}
    </Button>
  );
}
