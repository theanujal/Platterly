"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inr } from "@/modules/invoices/invoice-format";
import type { PayView } from "@/app/pay/[token]/pay-view";
import { PayClient } from "@/app/pay/[token]/_components/pay-client";
import { PaymentChoice, type PaymentMode } from "./payment-box";

/**
 * Shown right after the venue details, before the confirmation (AJ, 2026-10-14): choose the advance or any amount, then
 * pay right here: the kitchen's own payment screen is embedded (card / UPI / net banking, or a UPI QR confirmed with the
 * transaction number). Or "Not now". It can only be left through those buttons, not by clicking outside it or pressing
 * Esc, so a payment is never abandoned by accident. Either way the customer then sees the confirmation.
 */
export function PaymentDialog({
  open,
  onDone,
  token,
  advance,
  balance,
  advancePercent,
  orderNumber,
  mode = "advance",
}: {
  open: boolean;
  /** Not now, or paid: go on to the confirmation. */
  onDone: () => void;
  token: string;
  advance: number;
  balance: number;
  advancePercent: number;
  orderNumber: string | null;
  /** "balance" when the customer has already paid and is paying what is left, from the Confirmation page. */
  mode?: PaymentMode;
}) {
  const [pay, setPay] = useState<PayView | null>(null);
  // Razorpay's checkout window is outside this pop-up: while it is open the pop-up must not trap focus or it cannot be typed into.
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  return (
    // Controlled and never closed from inside the primitive: clicking outside and Esc ask it to close, and are ignored.
    <Dialog open={open} onOpenChange={() => {}} modal={!checkoutOpen}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md" data-testid="payment-dialog">
        <DialogHeader>
          <DialogTitle>{mode === "balance" ? "Pay the balance" : "Secure your date"}</DialogTitle>
          <DialogDescription>
            {pay
              ? `Paying for ${orderNumber ? `order ${orderNumber}` : "your order"}. Balance due: ${inr(balance)}.`
              : mode === "balance"
                ? `Pay what is left of your order in full, or any amount you like. Balance due: ${inr(balance)}${orderNumber ? ` · Order ${orderNumber}` : ""}.`
                : `Your venue details are in. Pay the advance now, or any amount you like. Balance due: ${inr(balance)}${orderNumber ? ` · Order ${orderNumber}` : ""}.`}
          </DialogDescription>
        </DialogHeader>
        {pay ? (
          <PayClient
            {...pay}
            embedded={{ onChangeAmount: () => setPay(null), onFinished: onDone, onNotNow: onDone, onCheckoutChange: setCheckoutOpen }}
          />
        ) : (
          <PaymentChoice token={token} advance={advance} balance={balance} advancePercent={advancePercent} mode={mode} onPay={setPay} onNotNow={onDone} />
        )}
      </DialogContent>
    </Dialog>
  );
}
