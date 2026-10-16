"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormCard } from "@/components/public/form-section";
import { inr } from "@/modules/invoices/invoice-format";
import type { CustomerPaymentView } from "@/modules/payments/payment";
import { ContactLinks } from "./contact-links";
import { PaymentDialog } from "./payment-dialog";
import type { VenuePayment } from "./venue-screen";

const METHOD_LABEL = { UPI: "UPI", CARD: "Card", NET_BANKING: "Net Banking", CASH: "Cash", BANK_TRANSFER: "Bank Transfer" } as const;
const TYPE_LABEL = { ADVANCE: "Advance", PARTIAL: "Partial payment", FINAL: "Final payment" } as const;
const STATUS = {
  CONFIRMED: { label: "Received", variant: "success" },
  PENDING: { label: "Awaiting confirmation", variant: "warning" },
  FAILED: { label: "Not completed", variant: "danger" },
} as const;

const REFRESH_MS = 15_000;

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

/**
 * The customer's payment record on the Confirmation page: every payment with its state (a UPI payment waits for the kitchen to
 * match its transaction number, then turns Received), what is paid, what is waiting and what is still due. While anything is
 * waiting, and whenever the customer returns to the tab, the page re-reads the order so the kitchen's confirmation shows up
 * without a reload (AJ, 2026-10-17). A kitchen with no online payment gets the way to reach it instead of a Pay button.
 */
export function PaymentStatusCard({
  view,
  kitchenName,
  orderNumber,
  token,
  pay,
  contact,
}: {
  view: CustomerPaymentView;
  kitchenName: string;
  orderNumber: string | null;
  token: string;
  /** The advance / balance the pop-up offers; null when the kitchen takes no online payment. */
  pay: VenuePayment | null;
  contact: { phone: string | null; email: string | null };
}) {
  const router = useRouter();
  const [payOpen, setPayOpen] = useState(false);
  const waiting = view.awaiting > 0;

  useEffect(() => {
    const refresh = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    const timer = waiting ? window.setInterval(refresh, REFRESH_MS) : null;
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      if (timer) window.clearInterval(timer);
    };
  }, [waiting, router]);

  const settled = view.balance <= 0;
  const headline = settled ? { label: "Paid in full", variant: "success" as const } : waiting ? { label: "Payment awaiting confirmation", variant: "warning" as const } : view.paid > 0 ? { label: "Part payment received", variant: "info" as const } : { label: "Payment due", variant: "warning" as const };
  // What is still to pay after the claims already sent: nobody should be asked to pay twice for the same money.
  const stillToPay = Math.max(view.balance - view.awaiting, 0);
  const message = `Hello, I would like to pay for my order${orderNumber ? ` ${orderNumber}` : ""}.`;

  return (
    <FormCard className="gap-4 md:p-5" data-testid="payment-status">
      {pay && <PaymentDialog open={payOpen} onDone={() => { setPayOpen(false); router.refresh(); }} token={token} {...pay} balance={stillToPay} mode="balance" />}
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CreditCard className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">Payment</h2>
          <p className="text-sm text-muted-foreground">{settled ? "Thank you, your order is fully paid." : "Your menu is final and our kitchen is getting ready."}</p>
        </div>
        <Badge variant={headline.variant} data-testid="payment-headline">
          {headline.label}
        </Badge>
      </div>

      <dl className="flex flex-col gap-2 rounded-lg bg-accent/60 p-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Order total</dt>
          <dd className="font-semibold tabular-nums">{inr(view.total)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Amount paid</dt>
          <dd className="font-semibold text-success tabular-nums" data-testid="payment-received">
            {inr(view.paid)}
          </dd>
        </div>
        {waiting && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Awaiting confirmation</dt>
            <dd className="font-semibold tabular-nums" data-testid="payment-awaiting">
              {inr(view.awaiting)}
            </dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
          <dt className="text-muted-foreground">Balance due</dt>
          <dd className="text-xl font-bold text-primary tabular-nums" data-testid="payment-due">
            {inr(view.balance)}
          </dd>
        </div>
        {orderNumber && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Order number</dt>
            <dd className="font-semibold" data-testid="payment-order-number">
              {orderNumber}
            </dd>
          </div>
        )}
      </dl>

      {waiting && (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm" data-testid="payment-waiting">
          <Clock className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-muted-foreground">
            We have your payment details. {kitchenName} will confirm the payment once it reaches their account, and it will show here as Received. This page updates by itself.
          </p>
        </div>
      )}

      {view.payments.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="payment-history">
          <h3 className="text-sm font-semibold">Payment history</h3>
          {view.payments.map((payment) => (
            <div key={payment.id} className="flex items-stretch overflow-hidden rounded-lg border border-border text-sm" data-testid="payment-row">
              <div className="flex w-28 shrink-0 flex-col justify-center bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium uppercase">{day(payment.at)}</span>
                <span>{time(payment.at)}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {TYPE_LABEL[payment.type]} · {METHOD_LABEL[payment.method]}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">Ref {payment.reference}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">{inr(payment.amount)}</span>
                  <Badge variant={STATUS[payment.status].variant}>{STATUS[payment.status].label}</Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!settled && pay && stillToPay > 0 && (
        <Button type="button" size="md" className="w-full" onClick={() => setPayOpen(true)}>
          {view.paid > 0 || waiting ? "Pay the balance" : "Pay now"}
        </Button>
      )}
      {!settled && !pay && stillToPay > 0 && (
        <>
          <p className="text-sm text-muted-foreground" data-testid="payment-later">
            Your caterer will share payment details with you. You can also reach out any time, and please quote your order number.
          </p>
          <ContactLinks contact={contact} message={message} />
        </>
      )}
    </FormCard>
  );
}
