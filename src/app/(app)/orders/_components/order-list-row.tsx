import { createElement } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, CreditCard, MapPin, User, Users, type LucideProps } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { cn } from "cn";
import type { listOrders } from "@/modules/orders/order";
import { countdownPillLabel, formatAmountExact, formatEventDates, getEventCountdown, getGuestCount, getOrderLocation, getPaymentBreakdown } from "@/modules/orders/order-card";
import { getOrderStatusHint } from "@/modules/orders/order-status";
import { ORDER_KIND_ICON, ORDER_KIND_LABEL, ORDER_KIND_VARIANT, STATUS_ICON, STATUS_LABEL, STATUS_VARIANT, TONE_SURFACE } from "./order-display";
import { ORDER_STATUS_TONE } from "@/modules/orders/order-status";

type OrderListItem = Awaited<ReturnType<typeof listOrders>>[number];

// Badge pads its leading edge tighter when it sees this attribute on an icon child.
const INLINE_START_ICON = { "data-icon": "inline-start" } as LucideProps;

/**
 * The Orders list view's cells (AJ, 2026-09-26): order # + type, customer +
 * location, event date + countdown, guests, total, payment, and a status with
 * a one-line description. Same data and rules as the grid card (order-card.ts),
 * so the two views can't disagree. The row click itself is CatalogBrowser's;
 * the customer name is also a real link so the row is keyboard-reachable.
 */
export function OrderListCells({ order, now }: { order: OrderListItem; now: Date }) {
  const StatusIcon = STATUS_ICON[order.status];
  const OrderKindIcon = ORDER_KIND_ICON[order.orderKind];
  const total = Number(order.total);
  const payment = getPaymentBreakdown({ total, advance: Number(order.advance), paymentStatus: order.paymentStatus });
  const countdown = getEventCountdown(order.eventStartDate, order.eventEndDate, order.status, now);
  const guests = getGuestCount(order);
  const location = getOrderLocation(order);
  const kitchenStages = order.events.flatMap((event) => (event.menuSelection ? [event.menuSelection.kitchenProductionStatus] : []));
  const statusTone = ORDER_STATUS_TONE[order.status];

  return (
    <>
      <TableCell className="px-3 py-3">
        <div className="flex flex-col items-start gap-1.5">
          <span className="text-sm font-semibold text-primary">{order.orderNumber ?? "—"}</span>
          <Badge variant={ORDER_KIND_VARIANT[order.orderKind]}>
            <OrderKindIcon data-icon="inline-start" />
            {ORDER_KIND_LABEL[order.orderKind]}
          </Badge>
        </div>
      </TableCell>

      <TableCell className="px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="size-5" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Link href={`/orders/${order.id}`} className="max-w-44 truncate font-semibold hover:underline">
              {order.customer.name}
            </Link>
            {location && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" />
                <span className="max-w-40 truncate">{location}</span>
              </span>
            )}
          </div>
        </div>
      </TableCell>

      <TableCell className="px-3 py-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="size-5 shrink-0 text-muted-foreground" />
          <div className="flex flex-col items-start gap-1">
            <span className="text-sm font-medium">{formatEventDates(order.eventStartDate, order.eventEndDate)}</span>
            {countdown && <Badge variant={countdown.tone}>{countdownPillLabel(countdown)}</Badge>}
          </div>
        </div>
      </TableCell>

      <TableCell className="px-3 py-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Users className="size-5 shrink-0 text-muted-foreground" />
          {guests ?? "—"}
        </span>
      </TableCell>

      <TableCell className="px-3 py-3 text-sm font-semibold">{formatAmountExact(total)}</TableCell>

      <TableCell className="px-3 py-3">
        <Badge variant={payment.tone}>
          <CreditCard data-icon="inline-start" />
          {payment.label}
        </Badge>
      </TableCell>

      <TableCell className="px-3 py-3">
        <div className="flex items-center gap-3">
          <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", TONE_SURFACE[statusTone])}>
            {createElement(StatusIcon, { className: "size-5" })}
          </div>
          <div className="flex flex-col items-start gap-1">
            <Badge variant={STATUS_VARIANT[order.status]}>
              {createElement(StatusIcon, INLINE_START_ICON)}
              {STATUS_LABEL[order.status]}
            </Badge>
            <span className="max-w-44 text-xs whitespace-normal text-muted-foreground">{getOrderStatusHint(order.status, kitchenStages)}</span>
          </div>
        </div>
      </TableCell>

      <TableCell className="px-3 py-3 text-right">
        <ChevronRight className="ml-auto size-5 text-muted-foreground" aria-hidden />
      </TableCell>
    </>
  );
}
