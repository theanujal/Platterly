"use client";

import { useState } from "react";
import { ChevronRight, CreditCard, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { inr } from "@/modules/invoices/invoice-format";
import { cn } from "cn";
import type { PayView } from "@/app/pay/[token]/pay-view";
import { createApprovalPaymentLinkAction } from "../actions";

type Choice = "ADVANCE" | "CUSTOM";

/**
 * The amount choice and Pay button: the advance or any other amount (no "full payment" option, AJ 2026-10-14), then the
 * kitchen's own payment screen, where the customer pays or, on a UPI QR, confirms with the transaction number. Used by the
 * pop-up shown right after the venue details, which then embeds the kitchen's payment screen. "Not now" is fine: the same
 * payment link is sent to the customer anyway.
 */
export function PaymentChoice({ token, advance, balance, advancePercent, onPay, onNotNow }: { token: string; advance: number; balance: number; advancePercent: number; onPay: (pay: PayView) => void; onNotNow: () => void }) {
  const [choice, setChoice] = useState<Choice>("ADVANCE");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const amount = choice === "ADVANCE" ? advance : Number(custom) || 0;
  const options: { key: Choice; title: string; hint: string; value: string | null }[] = [
    { key: "ADVANCE", title: "Advance", hint: `${advancePercent}% to confirm your date`, value: inr(advance) },
    { key: "CUSTOM", title: "Other amount", hint: `Pay any amount you like, up to ${inr(balance)}`, value: null },
  ];

  async function pay() {
    setError(null);
    if (!(amount > 0)) return setError("Enter an amount greater than zero.");
    setPending(true);
    const result = await createApprovalPaymentLinkAction(token, choice, choice === "CUSTOM" ? amount : undefined);
    if (!result.ok) {
      setPending(false);
      return setError(result.error);
    }
    setPending(false);
    onPay(result.pay); // the pop-up shows the payment screen right here
  }

  return (
    <>
      <div role="radiogroup" aria-label="How much would you like to pay?" className="flex flex-col gap-2.5">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={choice === option.key}
            onClick={() => setChoice(option.key)}
            className={cn("flex items-center gap-3 rounded-lg border p-3 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", choice === option.key ? "border-primary bg-accent" : "border-border bg-card")}
          >
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", choice === option.key ? "border-primary" : "border-foreground/30")}>{choice === option.key && <span className="size-2.5 rounded-full bg-primary" />}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{option.title}</span>
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </span>
            {option.value && <span className="font-semibold tabular-nums">{option.value}</span>}
          </button>
        ))}
      </div>
      {choice === "CUSTOM" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-custom">Amount (up to {inr(balance)})</Label>
          <IconInput icon={CreditCard} id="pay-custom" type="number" min={1} max={balance} step="0.01" value={custom} onChange={(e) => setCustom(e.target.value)} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="button" className="w-full" disabled={pending} onClick={pay}>
        {pending ? "Opening…" : `Pay ${inr(amount)}`}
        <ChevronRight />
      </Button>
      <div className="flex items-start gap-3 rounded-lg bg-accent/70 p-3 text-sm">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Send className="size-4" />
        </span>
        <div className="flex flex-col gap-2">
          <div>
            <p className="font-semibold">Not now? No problem.</p>
            <p className="text-muted-foreground">We are also sending you a payment link, so you can pay whenever you like.</p>
          </div>
          <Button type="button" variant="outline" size="md" className="self-start" onClick={onNotNow}>
            Not now
          </Button>
        </div>
      </div>
    </>
  );
}
