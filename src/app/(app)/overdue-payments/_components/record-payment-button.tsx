"use client";

import { useState } from "react";
import { Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordPaymentDialog } from "@/app/(app)/invoices/_components/payments-panel";

/**
 * "Record payment" straight from the Overdue Payments list (AJ, 2026-10-12): the Accounts team cannot open the order
 * page, so the same dialog the order page uses opens here. It refreshes the page on success, which drops a paid order.
 */
export function RecordPaymentButton({ orderId, orderLabel, total, paid, balance }: { orderId: string; orderLabel: string; total: number; paid: number; balance: number }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  return (
    <>
      <Button type="button" size="md" variant="outline" aria-label={`Record payment for ${orderLabel}`} onClick={() => setOpen(true)} className="relative z-10">
        <Banknote data-icon="inline-start" />
        Record payment
      </Button>
      {done && <span className="sr-only" role="status">{done}</span>}
      {open && <RecordPaymentDialog open={open} onOpenChange={setOpen} orderId={orderId} balance={balance} paid={paid} total={total} onDone={setDone} />}
    </>
  );
}
