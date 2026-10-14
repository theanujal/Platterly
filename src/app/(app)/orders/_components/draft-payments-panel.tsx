"use client";

import { useState } from "react";
import { CreditCard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentRowView, PaymentSummaryCard, PaymentsListCard, RecordPaymentDialog, type StagedPaymentDraft } from "../../invoices/_components/payments-panel";

/**
 * Payment summary and Payments on the New Order page (AJ, 2026-10-14): the same two cards and the same Record Payment as an
 * existing order's, so money looks and works the same everywhere. The order does not exist yet, so a payment added here is
 * held with the form and recorded (with its receipt, if asked) when the order is saved. Create Payment Link needs the
 * saved order, so it appears there.
 */
export function DraftPaymentsPanel({ total, payments, onChange }: { total: number; payments: StagedPaymentDraft[]; onChange: (payments: StagedPaymentDraft[]) => void }) {
  const [open, setOpen] = useState(false);
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = Math.max(Math.round((total - paid) * 100) / 100, 0);
  const over = paid > total + 0.005;

  return (
    <div className="flex flex-col gap-3" data-testid="payments-panel">
      <PaymentSummaryCard total={total} paid={paid} balance={balance}>
        {over && (
          <p role="alert" className="text-sm text-destructive">
            The payments are more than the order total. Remove one, or raise the total.
          </p>
        )}
        {balance > 0 && (
          <Button type="button" size="md" onClick={() => setOpen(true)}>
            <CreditCard />
            Record Payment
          </Button>
        )}
        {payments.length > 0 && <p className="text-xs text-muted-foreground">Recorded, with receipts, when you save the order.</p>}
      </PaymentSummaryCard>

      <PaymentsListCard empty={payments.length === 0}>
        {payments.map((payment) => (
          <PaymentRowView
            key={payment.key}
            id={payment.key}
            amount={payment.amount}
            type={payment.type}
            method={payment.method}
            receivedAt={payment.receivedAt}
            sourceText={payment.sendReceipt ? "receipt will be sent" : "recorded by the team"}
            reference={payment.reference || null}
            trailing={
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove the ${payment.amount} payment`} onClick={() => onChange(payments.filter((p) => p.key !== payment.key))}>
                <X className="size-4" />
              </Button>
            }
          />
        ))}
      </PaymentsListCard>

      {/* Fresh each time it opens: it starts from what is left to pay, so payments can be added one after another. */}
      <RecordPaymentDialog
        key={`${payments.length}-${open}`}
        open={open}
        onOpenChange={setOpen}
        total={total}
        paid={paid}
        balance={balance}
        onStage={(payment) => onChange([...payments, { ...payment, key: crypto.randomUUID() }])}
      />
    </div>
  );
}
