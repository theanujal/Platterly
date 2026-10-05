"use client";

import type { SecretsReveal } from "./actions";

/** The two signing secrets, shown once. The operator copies them into the product's environment. */
export function SecretsPanel({ reveal }: { reveal: SecretsReveal }) {
  if (!reveal.secrets) return null;
  return (
    <div role="status" className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
      <p className="font-semibold text-warning">Copy these secrets now. They are stored encrypted and cannot be shown again.</p>
      <dl className="mt-3 grid gap-3">
        <div>
          <dt className="font-medium">Ops signs commands with (the product verifies)</dt>
          <dd className="mt-1 break-all rounded-lg bg-white p-2 font-mono text-xs">{reveal.secrets.outbound}</dd>
        </div>
        <div>
          <dt className="font-medium">The product signs events with (ops verifies)</dt>
          <dd className="mt-1 break-all rounded-lg bg-white p-2 font-mono text-xs">{reveal.secrets.inbound}</dd>
        </div>
      </dl>
    </div>
  );
}
