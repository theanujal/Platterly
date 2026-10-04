import Link from "next/link";
import { CheckCircle2, CircleCheckBig, ClipboardCheck, ClipboardList, Hourglass, IndianRupee, Send, Wallet, XCircle } from "lucide-react";
import { ORDER_STATUS_LABEL } from "@/modules/orders/order-status";
import type { OrderStatus } from "@/generated/prisma/enums";

const STATUS_LABEL = ORDER_STATUS_LABEL;

// Same soft-tint icon chips as DashboardCardHeader, on plain white cards (design system §03/§08:
// colour marks the state, the card stays neutral).
const STATUS_STYLE: Record<OrderStatus, { icon: typeof ClipboardCheck; chip: string }> = {
  PENDING_REVIEW: { icon: ClipboardCheck, chip: "bg-amber-500/10 text-amber-600" },
  AWAITING_CUSTOMER_APPROVAL: { icon: Hourglass, chip: "bg-blue-500/10 text-blue-600" },
  APPROVED: { icon: CheckCircle2, chip: "bg-teal-500/10 text-teal-600" },
  SENT_TO_KITCHEN: { icon: Send, chip: "bg-slate-500/10 text-slate-600" },
  COMPLETED: { icon: CircleCheckBig, chip: "bg-emerald-500/10 text-emerald-600" },
  CANCELLED: { icon: XCircle, chip: "bg-rose-500/10 text-rose-600" },
};

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

interface DashboardKpisProps {
  statusBreakdown: { status: OrderStatus; count: number; totalValue: number }[];
  outstandingBalance: number;
  outstandingOrdersCount: number;
  /** Pending revenue and order values are shown only to roles that may see money. */
  showMoney: boolean;
}

// A colorful KPI system in place of six identical neutral cards — every
// Order status gets its own solid-color tile (so the pipeline is scannable
// at a glance), plus a secondary row translating the two most active
// statuses and the outstanding balance into real money.
export function DashboardKpis({ statusBreakdown, outstandingBalance, outstandingOrdersCount, showMoney }: DashboardKpisProps) {
  const inKitchenValue = statusBreakdown.find((s) => s.status === "SENT_TO_KITCHEN")?.totalValue ?? 0;
  const completedValue = statusBreakdown.find((s) => s.status === "COMPLETED")?.totalValue ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {statusBreakdown.map(({ status, count }) => {
          const { icon: Icon, chip } = STATUS_STYLE[status];
          return (
            <Link
              key={status}
              href={`/orders?status=${status}`}
              className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 transition-colors hover:bg-muted"
            >
              <div className={`flex size-9 items-center justify-center rounded-lg ${chip}`}>
                <Icon className="size-4" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-2xl font-semibold tracking-tight">{count}</div>
                <div className="text-sm text-muted-foreground">{STATUS_LABEL[status]}</div>
              </div>
            </Link>
          );
        })}
      </div>
      {showMoney && (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/orders"
          className="flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5 transition-colors hover:bg-amber-100"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700">
            <IndianRupee className="size-4" />
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-xs font-medium text-amber-800">Pending Revenue</div>
            <div className="text-lg font-semibold text-amber-900">{formatCurrency(outstandingBalance)}</div>
            <div className="text-[11px] text-amber-700/80">
              {outstandingOrdersCount} order{outstandingOrdersCount === 1 ? "" : "s"} outstanding
            </div>
          </div>
        </Link>
        <Link
          href="/orders?status=SENT_TO_KITCHEN"
          className="flex items-center gap-4 rounded-xl border border-blue-200 bg-blue-50 p-5 transition-colors hover:bg-blue-100"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-700">
            <ClipboardList className="size-4" />
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-xs font-medium text-blue-800">Orders in Kitchen Value</div>
            <div className="text-lg font-semibold text-blue-900">{formatCurrency(inKitchenValue)}</div>
          </div>
        </Link>
        <Link
          href="/orders?status=COMPLETED"
          className="flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 transition-colors hover:bg-emerald-100"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700">
            <Wallet className="size-4" />
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-xs font-medium text-emerald-800">Completed Orders Value</div>
            <div className="text-lg font-semibold text-emerald-900">{formatCurrency(completedValue)}</div>
          </div>
        </Link>
      </div>
      )}
    </div>
  );
}
