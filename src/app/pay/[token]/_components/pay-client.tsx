"use client";

import { useState } from "react";
import { CheckCircle2, CreditCard, Smartphone } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inr } from "@/modules/invoices/invoice-format";
import { claimUpiAction, startCheckoutAction, verifyCheckoutAction } from "../actions";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (response: { error?: { description?: string; metadata?: { payment_id?: string } } }) => void) => void };
  }
}

const TYPE_LABEL = { ADVANCE: "Advance", PARTIAL: "Partial payment", FINAL: "Final payment" } as const;

function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function PayClient({
  token,
  amount,
  balance,
  orderNumber,
  eventLabel,
  customerName,
  type,
  razorpay,
  upi,
  backHref,
  embedded,
}: {
  token: string;
  amount: number;
  balance: number;
  orderNumber: string;
  eventLabel: string;
  customerName: string;
  type: keyof typeof TYPE_LABEL;
  razorpay: boolean;
  upi: { uri: string; qr: string; id: string } | null;
  /** Where "Back to your order" goes once paid: the customer's approval page they came from. */
  backHref?: string | null;
  /** Inside the approval page's payment pop-up: no card of its own, a way back to the amount, and a Continue once paid or claimed. */
  embedded?: { onChangeAmount: () => void; onFinished: () => void; onNotNow: () => void; onCheckoutChange: (open: boolean) => void };
}) {
  const [state, setState] = useState<"idle" | "busy" | "paid" | "claimed">("idle");
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [transactionNumber, setTransactionNumber] = useState("");

  async function payOnline() {
    setError(null);
    setState("busy");
    const started = await startCheckoutAction(token);
    if (!started.ok) {
      setState("idle");
      return setError(started.error);
    }
    if (!(await loadCheckout()) || !window.Razorpay) {
      setState("idle");
      return setError("Could not load the payment window. Please check your connection and try again.");
    }
    const checkout = new window.Razorpay({
      key: started.keyId,
      amount: started.amountPaise,
      currency: "INR",
      name: started.businessName,
      description: started.description,
      order_id: started.razorpayOrderId,
      prefill: { name: customerName },
      theme: { color: "#FF6900" },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        embedded?.onCheckoutChange(false);
        const verified = await verifyCheckoutAction(token, response);
        if (verified.ok) setState("paid");
        else {
          setState("idle");
          setError(verified.error ?? "We could not verify this payment.");
        }
      },
      modal: {
        ondismiss: () => {
          embedded?.onCheckoutChange(false);
          setState((s) => (s === "busy" ? "idle" : s));
        },
      },
    });
    embedded?.onCheckoutChange(true);
    checkout.open();
  }

  async function claim() {
    setError(null);
    setState("busy");
    const result = await claimUpiAction(token, transactionNumber);
    if (!result.ok) {
      setState("idle");
      return setError(result.error ?? "Something went wrong.");
    }
    setState("claimed");
  }

  if (state === "paid" || state === "claimed") {
    return (
      <div role="status" className={embedded ? "flex flex-col items-center gap-3 p-2 text-center" : "flex flex-col items-center gap-3 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10"} data-testid="pay-done">
        <span className="flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="size-8" />
        </span>
        <h1 className="text-xl font-semibold">{state === "paid" ? "Payment received, thank you!" : "Thanks, we have noted your payment"}</h1>
        <p className="text-sm text-muted-foreground">
          {state === "paid" ? "We are sending your receipt. See you at the event!" : "The kitchen will match your transaction number with their account, confirm it, and send you a receipt."}
        </p>
        {embedded && (
          <Button type="button" onClick={embedded.onFinished}>
            Continue
          </Button>
        )}
        {!embedded && backHref && (
          <a href={backHref} className={buttonVariants({ variant: "outline" })}>
            Back to your order
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={embedded ? "flex flex-col gap-4" : "flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 md:p-6"}>
      <div className="text-center">
        <h1 className="text-xl font-semibold" data-testid="pay-amount">
          Pay {inr(amount)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {TYPE_LABEL[type]} for {orderNumber}
          {eventLabel ? ` · ${eventLabel}` : ""}
        </p>
        {balance > amount && <p className="mt-1 text-xs text-muted-foreground">Balance after this payment: {inr(balance - amount)}</p>}
      </div>

      {!razorpay && !upi && <p className="rounded-lg bg-muted/60 p-4 text-center text-sm text-muted-foreground">The kitchen will share payment details with you directly.</p>}

      {razorpay && (
        <Button type="button" className="w-full" disabled={state === "busy"} onClick={payOnline}>
          <CreditCard />
          {state === "busy" ? "Opening…" : "Pay with Card, UPI or Net Banking"}
        </Button>
      )}

      {razorpay && upi && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or pay with UPI
          <span className="h-px flex-1 bg-border" />
        </div>
      )}

      {upi && (
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a generated QR data URL */}
          <img src={upi.qr} alt={`UPI QR code for ${inr(amount)}`} className="size-44 rounded-xl bg-white p-2 ring-1 ring-foreground/10" data-testid="upi-qr" />
          <p className="text-center text-xs text-muted-foreground">
            Scan with any UPI app. The amount and order number are filled in. Paying {upi.id}.
          </p>
          <Button variant="outline" className="w-full" render={<a href={upi.uri} />} nativeButton={false}>
            <Smartphone />
            Open in UPI app
          </Button>
          {asking ? (
            <div className="flex w-full flex-col gap-2" data-testid="upi-confirm">
              <Label htmlFor="upi-txn">Transaction number (UTR)</Label>
              <Input id="upi-txn" value={transactionNumber} onChange={(e) => setTransactionNumber(e.target.value)} placeholder="e.g. 412345678901" autoComplete="off" maxLength={40} />
              <p className="text-xs text-muted-foreground">Find it in your UPI app under this payment (it may be called UTR, UPI Ref or Transaction ID). The kitchen uses it to confirm your payment.</p>
              <Button type="button" className="w-full" disabled={state === "busy" || transactionNumber.trim() === ""} onClick={claim}>
                {state === "busy" ? "Sending…" : "Confirm payment"}
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="w-full" onClick={() => setAsking(true)}>
              I have paid
            </Button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      )}

      {embedded && (
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <Button type="button" variant="ghost" size="md" onClick={embedded.onChangeAmount}>
            Change amount
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={embedded.onNotNow}>
            Not now
          </Button>
        </div>
      )}
    </div>
  );
}
