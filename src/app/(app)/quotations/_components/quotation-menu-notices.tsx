"use client";

import { AlertTriangle, Info } from "lucide-react";
import type { QuotationStatus } from "@/generated/prisma/enums";
import { cn } from "cn";

const TONE = {
  info: "border-info/30 bg-info/10 text-info",
  warning: "border-warning/30 bg-warning/10 text-warning",
  success: "border-success/30 bg-success/10 text-success",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted text-muted-foreground",
} as const;

/** The banner a quotation's stage gets above the menu builder, the way a menu approval gets one on the order. */
export function quotationStageBanner(status: QuotationStatus | undefined, customerMessage?: string | null): { tone: keyof typeof TONE; text: string } {
  switch (status) {
    case "SENT":
      return { tone: "warning", text: "This quotation is with the customer, so the menu is read-only. Recall the quotation to change it; send it again afterwards." };
    case "VIEWED":
      return { tone: "warning", text: "The customer has opened this quotation, so the menu is read-only. Recall the quotation to change it; send it again afterwards." };
    case "CHANGES_REQUESTED":
      return { tone: "warning", text: `The customer asked for changes${customerMessage ? `: “${customerMessage}”` : "."} Update the menu, then send the quotation again.` };
    case "ACCEPTED":
      return { tone: "success", text: "The customer accepted this quotation. Convert it to an order to continue: the menu built here moves into the order's Menu Approval tab." };
    case "REJECTED":
      return { tone: "danger", text: "The customer rejected this quotation." };
    case "EXPIRED":
      return { tone: "neutral", text: "This quotation has expired." };
    default:
      return { tone: "info", text: "Build the menu for this quotation: plan the meals for each event date and pick the dishes. The price comes from the Pricing tab, and nothing reaches the customer until you send it." };
  }
}

/** Every alert the menu builder shows: the stage banner, then anything in the plan that needs a look. */
export function QuotationMenuNotices({
  status,
  customerMessage,
  outsideDays,
  noDates,
  noAdults,
}: {
  status?: QuotationStatus;
  customerMessage?: string | null;
  /** Days that carry meals but fall outside the event dates. */
  outsideDays: string[];
  /** No event date is set yet, so there are no days to plan. */
  noDates: boolean;
  /** Meals are planned but no adults are entered, so the menu price is nothing. */
  noAdults: boolean;
}) {
  const banner = quotationStageBanner(status, customerMessage);
  const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  const alerts: string[] = [];
  if (noDates) alerts.push("Set the event date in Order Details first. The menu is planned for each event day.");
  if (outsideDays.length > 0) alerts.push(`Meals are planned on ${outsideDays.map(day).join(", ")}, outside the event dates. They are still priced; move the event dates or remove those meals.`);
  if (noAdults) alerts.push("No adults are entered, so the menu price is nothing. Add the guests in Order Details.");
  return (
    <div className="flex flex-col gap-3" data-testid="quotation-menu-notices">
      <div className={cn("flex items-start gap-2 rounded-xl border p-4 text-sm font-medium", TONE[banner.tone])} data-testid="quotation-stage-banner">
        {banner.tone === "danger" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
        <span>{banner.text}</span>
      </div>
      {alerts.map((text) => (
        <div key={text} role="status" className={cn("flex items-start gap-2 rounded-xl border p-3 text-sm", TONE.warning)} data-testid="quotation-menu-alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{text}</span>
        </div>
      ))}
    </div>
  );
}
