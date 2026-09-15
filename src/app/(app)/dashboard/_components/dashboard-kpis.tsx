import Link from "next/link";
import { FileEdit, CheckCircle2, ChefHat, PackageCheck, CircleCheckBig, XCircle, IndianRupee, ClipboardList, Wallet } from "lucide-react";
import type { OrderStatus } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  IN_PREPARATION: "In Preparation",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

// Same warm/cool accent hues already used throughout the app for icon chips
// (DashboardCardHeader's colorClassName, badge colors) — applied here as
// solid card fills instead of soft tints, for the bolder KPI-card look.
const STATUS_STYLE: Record<OrderStatus, { icon: typeof FileEdit; bg: string }> = {
  DRAFT: { icon: FileEdit, bg: "bg-slate-500" },
  CONFIRMED: { icon: CheckCircle2, bg: "bg-blue-600" },
  IN_PREPARATION: { icon: ChefHat, bg: "bg-amber-500" },
  READY: { icon: PackageCheck, bg: "bg-violet-600" },
  COMPLETED: { icon: CircleCheckBig, bg: "bg-emerald-600" },
  CANCELLED: { icon: XCircle, bg: "bg-rose-600" },
};

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

interface DashboardKpisProps {
  statusBreakdown: { status: OrderStatus; count: number; totalValue: number }[];
  outstandingBalance: number;
  outstandingOrdersCount: number;
}

// A colorful KPI system in place of six identical neutral cards — every
// Order status gets its own solid-color tile (so the pipeline is scannable
// at a glance), plus a secondary row translating the two most active
// statuses and the outstanding balance into real money.
export function DashboardKpis({ statusBreakdown, outstandingBalance, outstandingOrdersCount }: DashboardKpisProps) {
  const confirmedValue = statusBreakdown.find((s) => s.status === "CONFIRMED")?.totalValue ?? 0;
  const completedValue = statusBreakdown.find((s) => s.status === "COMPLETED")?.totalValue ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {statusBreakdown.map(({ status, count }) => {
          const { icon: Icon, bg } = STATUS_STYLE[status];
          return (
            <Link
              key={status}
              href={`/orders?status=${status}`}
              className={`flex flex-col gap-3 rounded-xl p-4 text-white shadow-sm transition-transform hover:-translate-y-0.5 ${bg}`}
            >
              <div className="flex size-8 items-center justify-center rounded-lg bg-white/20">
                <Icon className="size-4" />
              </div>
              <div>
                <div className="text-2xl font-semibold tracking-tight">{count}</div>
                <div className="text-xs font-medium text-white/85">{STATUS_LABEL[status]}</div>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          href="/orders"
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 transition-colors hover:bg-amber-100"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700">
            <IndianRupee className="size-4" />
          </div>
          <div>
            <div className="text-xs font-medium text-amber-800">Pending Revenue</div>
            <div className="text-lg font-semibold text-amber-900">{formatCurrency(outstandingBalance)}</div>
            <div className="text-[11px] text-amber-700/80">
              {outstandingOrdersCount} order{outstandingOrdersCount === 1 ? "" : "s"} outstanding
            </div>
          </div>
        </Link>
        <Link
          href="/orders?status=CONFIRMED"
          className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 transition-colors hover:bg-blue-100"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-700">
            <ClipboardList className="size-4" />
          </div>
          <div>
            <div className="text-xs font-medium text-blue-800">Confirmed Orders Value</div>
            <div className="text-lg font-semibold text-blue-900">{formatCurrency(confirmedValue)}</div>
          </div>
        </Link>
        <Link
          href="/orders?status=COMPLETED"
          className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 transition-colors hover:bg-emerald-100"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700">
            <Wallet className="size-4" />
          </div>
          <div>
            <div className="text-xs font-medium text-emerald-800">Completed Orders Value</div>
            <div className="text-lg font-semibold text-emerald-900">{formatCurrency(completedValue)}</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
