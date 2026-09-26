import { createElement } from "react";
import Link from "next/link";
import { CalendarDays, Clock, CreditCard, FileText, MapPin, User, Users, type LucideProps } from "lucide-react";
import { getEventTypeIcon } from "@/lib/event-type-icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import type { listOrders } from "@/modules/orders/order";
import { formatAmount, formatEventWhen, getGuestCount, getOrderLocation, getPaymentBreakdown, getCardCountdown, summarizeMenuApproval } from "@/modules/orders/order-card";
import { OrderCardMenu } from "./order-card-menu";
import { ORDER_KIND_ICON, ORDER_KIND_LABEL, ORDER_KIND_VARIANT, STATUS_ICON, STATUS_LABEL, STATUS_VARIANT, TONE_SURFACE } from "./order-display";

// Badge pads its leading edge tighter when it sees this attribute on an icon child.
const INLINE_START_ICON = { "data-icon": "inline-start" } as LucideProps;

type OrderListItem = Awaited<ReturnType<typeof listOrders>>[number];

function StatCell({ icon: Icon, caption, className, children }: { icon: typeof CalendarDays; caption: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5 @sm:px-3 @sm:first:pl-0 @sm:last:pr-0", className)}>
      {/* Icons drop out when the card is narrow so the three values keep their room. */}
      <Icon className="hidden size-5 shrink-0 text-muted-foreground @sm:block" />
      <div className="flex min-w-0 flex-col items-start gap-0.5 *:max-w-full">
        <span className="text-xs text-muted-foreground">{caption}</span>
        {children}
      </div>
    </div>
  );
}

interface OrderCardProps {
  order: OrderListItem;
  /** One timestamp for the whole page so every card's countdown agrees. */
  now: Date;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Orders grid card (AJ, 2026-09-26). The customer name is the card's link —
 * stretched over the whole card via `after:inset-0` rather than wrapping the
 * card in a `<Link>`, because the 3-dot menu is an interactive control and
 * can't be nested inside an anchor.
 */
export function OrderCard({ order, now, canEdit, canDelete }: OrderCardProps) {
  const StatusIcon = STATUS_ICON[order.status];
  const OrderKindIcon = ORDER_KIND_ICON[order.orderKind];

  const total = Number(order.total);
  const payment = getPaymentBreakdown({ total, advance: Number(order.advance), paymentStatus: order.paymentStatus });
  // Null only once the event has ended (AJ, 2026-09-26); Today / Tomorrow still show their countdown.
  const countdown = getCardCountdown(order.eventStartDate, order.eventEndDate, order.status, now);
  const menuApproval = summarizeMenuApproval(
    order.events.flatMap((event) => (event.menuSelection ? [event.menuSelection] : [])),
    order.status,
  );
  const guests = getGuestCount(order);
  const location = getOrderLocation(order);
  const orderLabel = order.orderNumber ?? "order";

  return (
    <div data-testid="order-card" className="@container relative flex flex-1 flex-col gap-4 p-5">
      {/* Narrow cards (the 4-column grid) drop the status badge onto its own row instead of squeezing it beside the order number. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="mr-auto text-sm font-medium whitespace-nowrap text-muted-foreground">{order.orderNumber ?? "—"}</span>
        <div className="relative z-10 order-2 @sm:order-3">
          <OrderCardMenu orderId={order.id} orderLabel={orderLabel} customerName={order.customer.name} canEdit={canEdit} canDelete={canDelete} />
        </div>
        <div className="order-3 basis-full @sm:order-2 @sm:basis-auto">
          <Badge variant={STATUS_VARIANT[order.status]}>
            <StatusIcon data-icon="inline-start" />
            {STATUS_LABEL[order.status]}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-3 @sm:gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary @sm:size-14">
          <User className="size-5 @sm:size-6" />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href={`/orders/${order.id}`}
            className="truncate text-base font-semibold outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
          >
            {order.customer.name}
          </Link>
          {location && (
            <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" />
              <span className="truncate">{location}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={ORDER_KIND_VARIANT[order.orderKind]}>
          <OrderKindIcon data-icon="inline-start" />
          {ORDER_KIND_LABEL[order.orderKind]}
        </Badge>
        {order.eventType && (
          <Badge variant="outline">
            {/* createElement, not a local `<Icon />`: the icon is looked up by name at runtime, which react-hooks/static-components reads as a component created during render. */}
            {createElement(getEventTypeIcon(order.eventType.icon), INLINE_START_ICON)}
            {order.eventType.name}
          </Badge>
        )}
      </div>

      {/* Wide: three columns, Event Date widest (a multi-day range is the longest value). Narrow: Event Date on its own row, Guests and countdown below. */}
      <div
        className={cn(
          "grid grid-cols-2 items-center gap-x-3 gap-y-3 @sm:gap-x-0 @sm:divide-x @sm:divide-border",
          countdown ? "@sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]" : "@sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]",
        )}
      >
        <StatCell icon={CalendarDays} caption="Event Date" className="col-span-2 @sm:col-span-1">
          <span className="text-sm font-semibold">{formatEventWhen(order.eventStartDate, order.eventEndDate, now)}</span>
        </StatCell>
        <StatCell icon={Users} caption="Guests">
          <span className="text-sm font-semibold">
            {guests ? guests : "—"}
            {/* The unit only shows when the card is wide enough — the caption already says "Guests". */}
            {guests ? <span className="hidden @lg:inline"> {guests === 1 ? "Guest" : "Guests"}</span> : null}
          </span>
        </StatCell>
        {countdown && (
          <StatCell icon={Clock} caption={countdown.caption}>
            <Badge variant={countdown.tone}>{countdown.label}</Badge>
          </StatCell>
        )}
      </div>

      {menuApproval && (
        <div className={cn("flex items-start gap-3 rounded-lg p-3", TONE_SURFACE[menuApproval.tone])}>
          <FileText className="mt-0.5 hidden size-5 shrink-0 @sm:block" />
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold">{menuApproval.title}</span>
            <span className="text-xs text-muted-foreground @sm:text-sm">{menuApproval.detail}</span>
          </div>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4 @sm:flex-row @sm:items-end @sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Order Amount</span>
          <span className="text-xl font-bold">{formatAmount(total)}</span>
        </div>
        <div className="flex flex-col items-start gap-1.5 @sm:items-end @sm:text-right">
          <Badge variant={payment.tone}>
            <CreditCard data-icon="inline-start" />
            {payment.label}
          </Badge>
          <span className="text-xs text-muted-foreground">{payment.summary}</span>
        </div>
      </div>
    </div>
  );
}
