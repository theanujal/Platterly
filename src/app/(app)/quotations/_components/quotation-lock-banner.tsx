"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isQuotationRecallable } from "@/modules/quotations/quotation-lock";
import type { QuotationStatus } from "@/generated/prisma/enums";
import { recallQuotationAction } from "../actions";

const TEXT: Partial<Record<QuotationStatus, { title: string; body: string }>> = {
  SENT: { title: "The quotation has been sent, so it is read-only.", body: "Recall it to edit. The customer's link stops working until you send it again." },
  VIEWED: { title: "The customer has opened this quotation, so it is read-only.", body: "Recall it to edit. The customer's link stops working until you send it again." },
  ACCEPTED: { title: "The customer accepted this quotation, so it is read-only.", body: "Convert it to an order to continue." },
  REJECTED: { title: "The customer rejected this quotation, so it is read-only.", body: "" },
  EXPIRED: { title: "This quotation has expired, so it is read-only.", body: "" },
};

/** One notice for the whole page, with the way back to editing (Recall), as an order shows while its menu is with the customer. */
export function QuotationLockBanner({ quotationId, status }: { quotationId: string; status: QuotationStatus }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = TEXT[status];
  if (!text) return null;

  async function recall() {
    setPending(true);
    setError(null);
    const result = await recallQuotationAction(quotationId);
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div role="status" className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-info/30 bg-info/10 p-4 text-sm" data-testid="quotation-locked-banner">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Lock className="mt-0.5 size-4 shrink-0 text-info" />
        <div>
          <p className="font-semibold">{text.title}</p>
          {text.body && <p className="text-muted-foreground">{text.body}</p>}
          {error && (
            <p role="alert" className="mt-1 text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
      {isQuotationRecallable(status) && (
        <Button type="button" size="md" variant="outline" disabled={pending} onClick={() => void recall()}>
          {pending ? "Recalling…" : "Recall to edit"}
        </Button>
      )}
    </div>
  );
}
