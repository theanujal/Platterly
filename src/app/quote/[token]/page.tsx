import type { Metadata } from "next";
import { CalendarDays, MapPin, PartyPopper, UtensilsCrossed } from "lucide-react";
import { prisma } from "@/lib/db";
import { resolveQuotationToken, getQuotation, markQuotationViewed, isQuotationPastValidity } from "@/modules/quotations/quotation";
import { Badge } from "@/components/ui/badge";
import { PublicShell } from "@/components/public/public-shell";
import { FormCard } from "@/components/public/form-section";
import { QuotationResponseActions } from "./_components/quotation-response-actions";
import type { QuotationStatus, MealType } from "@/generated/prisma/enums";

const MEAL_TYPE_LABEL: Record<MealType, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  HITEA: "Hi-Tea",
  DINNER: "Dinner",
  OTHER: "Other",
};

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
      <PublicShell brand={{ name: "Platterly", logo: null }} width="max-w-xl">
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10 md:p-12">
          <h1 className="text-2xl font-semibold">This link is no longer valid</h1>
          <p className="text-sm text-muted-foreground">It may have been revoked or expired. Ask your caterer to resend it.</p>
        </div>
      </PublicShell>
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
      <PublicShell brand={{ name: organization.name, logo: organization.logo }} width="max-w-xl">
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10 md:p-12">
          <h1 className="text-2xl font-semibold">This quotation is no longer available</h1>
        </div>
      </PublicShell>
    );
  }

  const isExpiredByDate = isQuotationPastValidity(quotation.validUntil);

  const dayFormat = { day: "numeric", month: "short", year: "numeric" } as const;
  const dateText =
    quotation.eventStartDate && quotation.eventEndDate
      ? quotation.eventStartDate.toLocaleDateString("en-IN", dayFormat) +
        (quotation.eventStartDate.getTime() !== quotation.eventEndDate.getTime() ? ` – ${quotation.eventEndDate.toLocaleDateString("en-IN", dayFormat)}` : "")
      : null;

  return (
    <PublicShell
      brand={{ name: organization.name, logo: organization.logo }}
      title="Your Quotation"
      subtitle={`Quotation for ${quotation.customer.name}`}
      width="max-w-2xl"
    >
      <div className="flex justify-center">
        <Badge variant={STATUS_VARIANT[quotation.status]}>{STATUS_LABEL[quotation.status]}</Badge>
      </div>

      {(quotation.venue || quotation.eventType) && (
        <FormCard className="gap-3 text-sm">
          {quotation.eventType && <Detail icon={<PartyPopper className="size-4" />} label="Event Type" value={quotation.eventType.name} />}
          {dateText && <Detail icon={<CalendarDays className="size-4" />} label="Date" value={dateText} />}
          {quotation.venue && <Detail icon={<MapPin className="size-4" />} label="Venue" value={quotation.venue} />}
        </FormCard>
      )}

      {/*
        Item-picker parity with Order (2026-09-28) — a Quotation's items now
        live per meal slot (quotation.mealPlanEntries[].items), grouped here
        by meal so a multi-day/multi-meal quotation reads clearly rather than
        one interleaved flat list. `quotation.items` (mealPlanEntryId: null)
        only holds pre-parity legacy rows now and renders separately below,
        only when present.
      */}
      {quotation.mealPlanEntries.map((entry) => (
        <section key={entry.id} className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UtensilsCrossed className="size-5" />
            </span>
            <h2 className="text-[15px] font-semibold">
              {MEAL_TYPE_LABEL[entry.mealType]}
              {quotation.mealPlanEntries.length > 1 ? ` · ${entry.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
            </h2>
          </div>
          {entry.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {entry.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span>
                    <span>{item.name}</span> <span className="text-muted-foreground">× {item.quantity}</span>
                  </span>
                  <span className="font-medium">{formatCurrency(Number(item.unitPrice) * item.quantity)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      {quotation.items.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <h2 className="text-[15px] font-semibold">Items</h2>
          <div className="flex flex-col divide-y divide-border">
            {quotation.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                <span>
                  <span>{item.name}</span> <span className="text-muted-foreground">× {item.quantity}</span>
                </span>
                <span className="font-medium">{formatCurrency(Number(item.unitPrice) * item.quantity)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-2 rounded-xl bg-card p-5 text-sm ring-1 ring-foreground/10">
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(Number(quotation.subtotal))}</span></div>
        {Number(quotation.childrenCharge) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Children Guests &amp; Pricing</span><span>+{formatCurrency(Number(quotation.childrenCharge))}</span></div>}
        {Number(quotation.discount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{formatCurrency(Number(quotation.discount))}</span></div>}
        {Number(quotation.taxes) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Taxes</span><span>+{formatCurrency(Number(quotation.taxes))}</span></div>}
        {Number(quotation.additionalCharges) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Additional Charges</span><span>+{formatCurrency(Number(quotation.additionalCharges))}</span></div>}
        {Number(quotation.deliveryCharges) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Delivery Charges</span><span>+{formatCurrency(Number(quotation.deliveryCharges))}</span></div>}
        <div className="mt-1 flex justify-between rounded-lg bg-accent px-4 py-3 font-semibold text-accent-foreground"><span>Total</span><span>{formatCurrency(Number(quotation.total))}</span></div>
      </div>

      {quotation.terms && (
        <section className="flex flex-col gap-2 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <h2 className="text-[15px] font-semibold">Terms</h2>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{quotation.terms}</p>
        </section>
      )}

      {quotation.validUntil && (
        <p className="text-center text-xs text-muted-foreground">
          Valid until {quotation.validUntil.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          {isExpiredByDate && " — this quotation has passed its validity date."}
        </p>
      )}

      {ACTIONABLE_STATUSES.includes(quotation.status) ? (
        <QuotationResponseActions token={token} />
      ) : (
        <p className="rounded-xl bg-card p-5 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
          {quotation.status === "ACCEPTED" && "You've accepted this quotation. Your caterer will follow up shortly."}
          {quotation.status === "REJECTED" && "You've declined this quotation."}
          {quotation.status === "CHANGES_REQUESTED" && "You've requested changes — your caterer will send an updated quotation."}
          {quotation.status === "EXPIRED" && "This quotation has expired."}
        </p>
      )}
    </PublicShell>
  );
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}
