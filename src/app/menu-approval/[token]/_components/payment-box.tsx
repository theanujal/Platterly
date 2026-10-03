"use client";

import { useState } from "react";
import { ChevronRight, CreditCard, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { FormCard } from "@/components/public/form-section";
import { inr } from "@/modules/invoices/invoice-format";
import { cn } from "cn";
import { createApprovalPaymentLinkAction } from "../actions";

type Choice = "ADVANCE" | "FULL" | "CUSTOM";

/**
 * "Pay now to secure your date" on the Confirmation stage. Advance, Full amount or a custom amount, then the kitchen's
 * own payment page. Skipping is fine: the same payment link is sent to the customer anyway.
 */
export function PaymentBox({ token, advance, balance, advancePercent, paid }: { token: string; advance: number; balance: number; advancePercent: number; paid: number }) {
  const [choice, setChoice] = useState<Choice>("ADVANCE");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const amount = choice === "ADVANCE" ? advance : choice === "FULL" ? balance : Number(custom) || 0;
  const options: { key: Choice; title: string; hint: string; value: string | null }[] = [
    { key: "ADVANCE", title: "Advance", hint: `${advancePercent}% to confirm your date`, value: inr(advance) },
    { key: "FULL", title: paid > 0 ? "Remaining balance" : "Full amount", hint: "Nothing left to pay later", value: inr(balance) },
    { key: "CUSTOM", title: "Custom amount", hint: "Pay any amount you choose", value: null },
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
    window.location.assign(result.path);
  }

  return (
    <div data-testid="payment-box">
    <FormCard className="gap-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CreditCard className="size-5" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold">Pay now to secure your date</h2>
          <p className="text-sm text-muted-foreground">Your menu is final and our kitchen is getting ready.</p>
        </div>
      </div>
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
        <div>
          <p className="font-semibold">Not now? No problem.</p>
          <p className="text-muted-foreground">We are also sending you a payment link, so you can pay whenever you like.</p>
        </div>
      </div>
    </FormCard>
    </div>
  );
}
