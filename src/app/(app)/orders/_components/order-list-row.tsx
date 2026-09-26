import { createElement } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, MapPin, User, Users, type LucideProps } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import type { listOrders } from "@/modules/orders/order";
import { formatAmountExact, formatEventWhen, getGuestCount, getOrderLocation, getPaymentBreakdown } from "@/modules/orders/order-card";
import { ORDER_KIND_ICON, ORDER_KIND_LABEL, ORDER_KIND_VARIANT, STATUS_ICON, STATUS_LABEL, STATUS_VARIANT, TONE_TEXT } from "./order-display";

type OrderListItem = Awaited<ReturnType<typeof listOrders>>[number];

// Badge pads its leading edge tighter when it sees this attribute on an icon child.
const INLINE_START_ICON = { "data-icon": "inline-start" } as LucideProps;

/**
 * The Orders list view's cells (AJ, 2026-09-26/27): order #, order type,
 * customer + venue, event (Today / Tomorrow / date, with the event type as
 * text below), guests, amount (with the payment status as colored text below),
 * and status (the badge alone). Same data and rules as the grid card (order-card.ts),
 * so the two views can't disagree. The row click itself is CatalogBrowser's;
 * the customer name is also a real link so the row is keyboard-reachable.
 */
export function OrderListCells({ order, now }: { order: OrderListItem; now: Date }) {
  const StatusIcon = STATUS_ICON[order.status];
  const OrderKindIcon = ORDER_KIND_ICON[order.orderKind];
  const total = Number(order.total);
  const payment = getPaymentBreakdown({ total, advance: Number(order.advance), paymentStatus: order.paymentStatus });
  const guests = getGuestCount(order);
  const location = getOrderLocation(order);

  return (
    <>
      <TableCell className="px-3 py-3">
        <span className="text-sm font-semibold whitespace-nowrap text-primary">{order.orderNumber ?? "—"}</span>
      </TableCell>

      <TableCell className="px-3 py-3">
        <Badge variant={ORDER_KIND_VARIANT[order.orderKind]}>
          <OrderKindIcon data-icon="inline-start" />
          {ORDER_KIND_LABEL[order.orderKind]}
        </Badge>
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
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium whitespace-nowrap">{formatEventWhen(order.eventStartDate, order.eventEndDate, now)}</span>
            {/* An Event Type has no status color of its own, so it reads as plain muted text. */}
            {order.eventType && <span className="max-w-40 truncate text-xs text-muted-foreground">{order.eventType.name}</span>}
          </div>
        </div>
      </TableCell>

      <TableCell className="px-3 py-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Users className="size-5 shrink-0 text-muted-foreground" />
          {guests ?? "—"}
        </span>
      </TableCell>

      <TableCell className="px-3 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold whitespace-nowrap">{formatAmountExact(total)}</span>
          <span className={`text-xs font-medium ${TONE_TEXT[payment.tone]}`}>{payment.label}</span>
        </div>
      </TableCell>

      <TableCell className="px-3 py-3">
        <Badge variant={STATUS_VARIANT[order.status]}>
          {createElement(StatusIcon, INLINE_START_ICON)}
          {STATUS_LABEL[order.status]}
        </Badge>
      </TableCell>

      <TableCell className="px-3 py-3 text-right">
        <ChevronRight className="ml-auto size-5 text-muted-foreground" aria-hidden />
      </TableCell>
    </>
  );
}
