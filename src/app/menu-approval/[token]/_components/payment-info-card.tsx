import { CreditCard } from "lucide-react";
import { FormCard } from "@/components/public/form-section";
import { inr } from "@/modules/invoices/invoice-format";
import { ContactLinks } from "./contact-links";

/**
 * The Payment card when the kitchen has not set up Razorpay or UPI (AJ, 2026-10-14): not a dead end any more. It says what
 * is owed and which order to quote, and gives the way to pay: call or message the kitchen.
 */
export function PaymentInfoCard({ balance, orderNumber, advance, contact }: { balance: number; orderNumber: string | null; advance: number; contact: { phone: string | null; email: string | null } }) {
  const message = `Hello, I would like to pay for my order${orderNumber ? ` ${orderNumber}` : ""}.`;
  return (
    <FormCard className="gap-4 md:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CreditCard className="size-5" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold">Payment</h2>
          <p className="text-sm text-muted-foreground">Your menu is final and our kitchen is getting ready.</p>
        </div>
      </div>
      <dl className="flex flex-col gap-2 rounded-lg bg-accent/60 p-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Balance due</dt>
          <dd className="text-xl font-bold text-primary tabular-nums" data-testid="payment-due">
            {inr(balance)}
          </dd>
        </div>
        {advance > 0 && advance < balance && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Advance to confirm your date</dt>
            <dd className="font-semibold tabular-nums">{inr(advance)}</dd>
          </div>
        )}
        {orderNumber && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Order number</dt>
            <dd className="font-semibold" data-testid="payment-order-number">
              {orderNumber}
            </dd>
          </div>
        )}
      </dl>
      <p className="text-sm text-muted-foreground" data-testid="payment-later">
        Your caterer will share payment details with you. You can also reach out any time, and please quote your order number.
      </p>
      <ContactLinks contact={contact} message={message} />
    </FormCard>
  );
}
