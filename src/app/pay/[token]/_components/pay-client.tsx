"use client";

import { useState } from "react";
import { CheckCircle2, CreditCard, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inr } from "@/modules/invoices/invoice-format";
import { claimUpiAction, startCheckoutAction, verifyCheckoutAction } from "../actions";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: () => void) => void };
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
}) {
  const [state, setState] = useState<"idle" | "busy" | "paid" | "claimed">("idle");
  const [error, setError] = useState<string | null>(null);

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
        const verified = await verifyCheckoutAction(token, response);
        if (verified.ok) setState("paid");
        else {
          setState("idle");
          setError(verified.error ?? "We could not verify this payment.");
        }
      },
      modal: { ondismiss: () => setState((s) => (s === "busy" ? "idle" : s)) },
    });
    checkout.open();
  }

  async function claim() {
    setError(null);
    setState("busy");
    const result = await claimUpiAction(token);
    if (!result.ok) {
      setState("idle");
      return setError(result.error ?? "Something went wrong.");
    }
    setState("claimed");
  }

  if (state === "paid" || state === "claimed") {
    return (
      <div role="status" className="flex flex-col items-center gap-3 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10" data-testid="pay-done">
        <span className="flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="size-8" />
        </span>
        <h1 className="text-xl font-semibold">{state === "paid" ? "Payment received, thank you!" : "Thanks, we have noted your payment"}</h1>
        <p className="text-sm text-muted-foreground">
          {state === "paid" ? "We are sending your receipt. See you at the event!" : "The kitchen will confirm it once it reaches their account, and send you a receipt."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 md:p-6">
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
          <Button type="button" variant="outline" className="w-full" disabled={state === "busy"} onClick={claim}>
            I have paid
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
