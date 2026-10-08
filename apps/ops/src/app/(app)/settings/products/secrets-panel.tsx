"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import type { SecretsReveal } from "./actions";

/** The connection settings, shown once, as a block ready to paste into the product's environment file. */
export function SecretsPanel({ reveal }: { reveal: SecretsReveal }) {
  const [copied, setCopied] = useState(false);
  if (!reveal.secrets) return null;
  const block = [`OPS_PRODUCT_KEY=${reveal.productKey ?? ""}`, `OPS_COMMAND_SECRETS=${reveal.secrets.outbound}`, `OPS_EVENT_SECRET=${reveal.secrets.inbound}`].join("\n");
  return (
    <div role="status" className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
      <p className="font-semibold text-warning">Copy these connection settings now. They are stored encrypted and cannot be shown again.</p>
      <p className="mt-1 text-muted-foreground">Paste them into the product&apos;s environment file, along with <span className="font-mono text-xs">OPS_BASE_URL</span> (the address of Ops), then restart the product. Ops reads what the product offers (plans, limits, reports) by itself once they are in.</p>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-white p-3 font-mono text-xs">{block}</pre>
      <div className="mt-3">
        <Button type="button" variant="outline" size="md" onClick={() => navigator.clipboard.writeText(block).then(() => setCopied(true))}><Copy className="size-4" aria-hidden /> {copied ? "Copied" : "Copy"}</Button>
      </div>
    </div>
  );
}
