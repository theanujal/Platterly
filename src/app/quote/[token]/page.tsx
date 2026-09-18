import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/db";
import { resolveQuotationToken, getQuotation, markQuotationViewed, isQuotationPastValidity } from "@/modules/quotations/quotation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { QuotationResponseActions } from "./_components/quotation-response-actions";
import type { QuotationStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Quotation — Platterly",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<QuotationStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  VIEWED: "Viewed",
  CHANGES_REQUESTED: "Changes Requested",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

// Kept in sync with the same legend in (app)/quotations/page.tsx (AJ,
// 2026-09-19) — a status should read identically wherever it appears.
const STATUS_VARIANT: Record<QuotationStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  SENT: "info",
  VIEWED: "info",
  CHANGES_REQUESTED: "warning",
  ACCEPTED: "success",
  REJECTED: "danger",
  EXPIRED: "neutral",
};

const ACTIONABLE_STATUSES: QuotationStatus[] = ["SENT", "VIEWED"];

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

export default async function PublicQuotationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveQuotationToken(token);

  if (!resolved) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <h1 className="text-xl font-semibold">This link is no longer valid</h1>
          <p className="text-sm text-muted-foreground">It may have been revoked or expired. Ask your caterer to resend it.</p>
        </div>
      </main>
    );
  }

  // First customer view: Sent -> Viewed. Safe to call unconditionally — a no-op past that status.
  await markQuotationViewed(resolved.organizationId, resolved.quotationId);

  const [quotation, organization] = await Promise.all([
    getQuotation(resolved.organizationId, resolved.quotationId),
    prisma.organization.findUniqueOrThrow({ where: { id: resolved.organizationId } }),
  ]);
  if (!quotation) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <h1 className="text-xl font-semibold">This quotation is no longer available</h1>
        </div>
      </main>
    );
  }

  const isExpiredByDate = isQuotationPastValidity(quotation.validUntil);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 md:px-8">
      <header className="flex flex-col items-center gap-2 text-center">
        {organization.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={organization.logo} alt={organization.name} className="h-12 w-auto" />
        ) : (
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <FileText className="size-5 text-muted-foreground" />
          </div>
        )}
        <h1 className="text-xl font-semibold">{organization.name}</h1>
        <p className="text-sm text-muted-foreground">Quotation for {quotation.customer.name}</p>
        <Badge variant={STATUS_VARIANT[quotation.status]}>{STATUS_LABEL[quotation.status]}</Badge>
      </header>

      {(quotation.venue || quotation.eventType) && (
        <Card>
          <CardContent className="flex flex-col gap-1 text-sm">
            {quotation.eventType && <p><span className="text-muted-foreground">Event Type: </span>{quotation.eventType.name}</p>}
            {quotation.eventStartDate && quotation.eventEndDate && (
              <p>
                <span className="text-muted-foreground">Date: </span>
                {quotation.eventStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                {quotation.eventStartDate.getTime() !== quotation.eventEndDate.getTime() &&
                  ` – ${quotation.eventEndDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
              </p>
            )}
            {quotation.venue && <p><span className="text-muted-foreground">Venue: </span>{quotation.venue}</p>}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Items</h2>
        {quotation.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <span>
              <span>{item.name}</span> <span className="text-muted-foreground">× {item.quantity}</span>
            </span>
            <span>{formatCurrency(Number(item.unitPrice) * item.quantity)}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-4 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(Number(quotation.subtotal))}</span></div>
        {Number(quotation.discount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{formatCurrency(Number(quotation.discount))}</span></div>}
        {Number(quotation.taxes) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Taxes</span><span>+{formatCurrency(Number(quotation.taxes))}</span></div>}
        {Number(quotation.additionalCharges) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Additional Charges</span><span>+{formatCurrency(Number(quotation.additionalCharges))}</span></div>}
        {Number(quotation.deliveryCharges) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Delivery Charges</span><span>+{formatCurrency(Number(quotation.deliveryCharges))}</span></div>}
        <div className="flex justify-between border-t border-border pt-1.5 font-semibold"><span>Total</span><span>{formatCurrency(Number(quotation.total))}</span></div>
      </div>

      {quotation.terms && (
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Terms</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{quotation.terms}</p>
        </div>
      )}

      {quotation.validUntil && (
        <p className="text-xs text-muted-foreground">
          Valid until {quotation.validUntil.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          {isExpiredByDate && " — this quotation has passed its validity date."}
        </p>
      )}

      {ACTIONABLE_STATUSES.includes(quotation.status) ? (
        <QuotationResponseActions token={token} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {quotation.status === "ACCEPTED" && "You've accepted this quotation. Your caterer will follow up shortly."}
          {quotation.status === "REJECTED" && "You've declined this quotation."}
          {quotation.status === "CHANGES_REQUESTED" && "You've requested changes — your caterer will send an updated quotation."}
          {quotation.status === "EXPIRED" && "This quotation has expired."}
        </p>
      )}
    </main>
  );
}
