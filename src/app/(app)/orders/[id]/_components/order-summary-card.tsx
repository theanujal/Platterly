import { CalendarClock, CalendarDays, ChefHat, Hash, History, MapPin, ReceiptText, Tag, User, Users } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { ORDER_STATUS_LABEL } from "@/modules/orders/order-status";
import { SummaryCard, SummaryRow } from "../../_components/order-form-parts";
import type { OrderStatus } from "@/generated/prisma/enums";

const fmt = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Sidebar summary on the Order detail page (AJ, 2026-09-30): number,
 * kitchen and timestamps, with a copy icon that puts them on the clipboard as plain text.
 */
export function OrderSummaryCard({
  orderNumber,
  status,
  assignedKitchen,
  showKitchen,
  createdAt,
  updatedAt,
  customer,
  orderType,
  eventType,
  eventDate,
  venue,
  guests,
}: {
  customer: string;
  orderType: string;
  eventType: string | null;
  eventDate: string;
  venue: string | null;
  guests: { total: number; adults: number; below5: number; from5to10: number };
  orderNumber: string | null;
  status: OrderStatus;
  assignedKitchen: string | null;
  /** Only a kitchen that works from more than one location has an assigned kitchen to show. */
  showKitchen: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  const copyText = [
    `Order Number: ${orderNumber ?? "—"}`,
    `Status: ${ORDER_STATUS_LABEL[status]}`,
    `Customer: ${customer}`,
    `Order Type: ${orderType}`,
    `Event Type: ${eventType ?? "Not set"}`,
    `Event Date: ${eventDate}`,
    `Venue: ${venue || "Not set"}`,
    `Guests: ${guests.total} (${guests.adults} Adults, ${guests.below5} Children <5, ${guests.from5to10} Children 5–10)`,
    ...(showKitchen ? [`Assigned Kitchen: ${assignedKitchen ?? "Not assigned"}`] : []),
    `Created on: ${fmt(createdAt)}`,
    `Last updated: ${fmt(updatedAt)}`,
  ].join("\n");

  return (
    <SummaryCard icon={ReceiptText} title="Order Summary" action={<CopyButton value={copyText} label="Copy order summary" iconOnly />}>
      <SummaryRow icon={Hash} label="Order No.">
        {orderNumber ?? "—"}
      </SummaryRow>
      <SummaryRow icon={User} label="Customer">
        <span className="break-words">{customer}</span>
      </SummaryRow>
      <SummaryRow icon={Users} label="Order Type">
        {orderType}
      </SummaryRow>
      <SummaryRow icon={Tag} label="Event Type">
        {eventType ?? "Not set"}
      </SummaryRow>
      <SummaryRow icon={CalendarDays} label="Event Date">
        {eventDate}
      </SummaryRow>
      <SummaryRow icon={MapPin} label="Venue">
        <span className="break-words">{venue || "Not set"}</span>
      </SummaryRow>
      <SummaryRow icon={Users} label="Guests">
        <span>{guests.total}</span>
        <span className="text-xs font-normal text-muted-foreground">
          ({guests.adults} Adults, {guests.below5} Children &lt;5, {guests.from5to10} Children 5–10)
        </span>
      </SummaryRow>
      {showKitchen && (
        <SummaryRow icon={ChefHat} label="Kitchen">
          <span className="break-words">{assignedKitchen ?? "Not assigned"}</span>
        </SummaryRow>
      )}
      <SummaryRow icon={CalendarClock} label="Created on">
        {fmt(createdAt)}
      </SummaryRow>
      <SummaryRow icon={History} label="Last update">
        {fmt(updatedAt)}
      </SummaryRow>
    </SummaryCard>
  );
}
