import Link from "next/link";
import { CalendarDays, ChevronRight, FileText, IndianRupee, ShoppingBag, Users, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatAmount } from "@/modules/orders/order-card";
import { cn } from "cn";

interface Tile {
  key: string;
  href: string;
  icon: LucideIcon;
  chip: string;
  value: string;
  label: string;
  note: string;
  noteVariant: "danger" | "success" | "warning" | "neutral";
}

interface KpiTilesProps {
  showOrders: boolean;
  showMoney: boolean;
  showQuotations: boolean;
  activeOrders: number;
  needAttention: number;
  upcomingEvents: number;
  nextWeekGuests: number;
  pendingRevenue: number;
  pendingRevenueOrders: number;
  openQuotations: number;
  quotationsAwaiting: number;
}

/** The row of five headline numbers. A tile shows only when the role may see what it counts. */
export function KpiTiles(props: KpiTilesProps) {
  const tiles: Tile[] = [
    props.showOrders && {
      key: "active",
      href: "/orders",
      icon: ShoppingBag,
      chip: "bg-primary/10 text-primary",
      value: String(props.activeOrders),
      label: "Active Orders",
      note: props.needAttention > 0 ? `${props.needAttention} need attention` : "All on track",
      noteVariant: props.needAttention > 0 ? "danger" : "success",
    },
    props.showOrders && {
      key: "events",
      href: "/calendar",
      icon: CalendarDays,
      chip: "bg-info/10 text-info",
      value: String(props.upcomingEvents),
      label: "Upcoming Events",
      note: "Next 7 days",
      noteVariant: "neutral",
    },
    props.showOrders && {
      key: "guests",
      href: "/calendar",
      icon: Users,
      chip: "bg-success/10 text-success",
      value: props.nextWeekGuests.toLocaleString("en-IN"),
      label: "Total Guests",
      note: "Next 7 days",
      noteVariant: "success",
    },
    props.showMoney && {
      key: "revenue",
      href: "/orders",
      icon: IndianRupee,
      chip: "bg-primary/10 text-primary",
      value: formatAmount(props.pendingRevenue),
      label: "Pending Revenue",
      note: `${props.pendingRevenueOrders} order${props.pendingRevenueOrders === 1 ? "" : "s"}`,
      noteVariant: "warning",
    },
    props.showQuotations && {
      key: "quotations",
      href: "/quotations",
      icon: FileText,
      chip: "bg-destructive/10 text-destructive",
      value: String(props.openQuotations),
      label: "Quotations",
      note: `${props.quotationsAwaiting} awaiting response`,
      noteVariant: "warning",
    },
  ].filter((tile): tile is Tile => Boolean(tile));

  if (tiles.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((tile) => (
        <Link
          key={tile.key}
          href={tile.href}
          className="group flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-3"
        >
          <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tile.chip)}>
            <tile.icon className="size-5" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-semibold tracking-tight">{tile.value}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </div>
            <span className="text-sm whitespace-nowrap text-muted-foreground">{tile.label}</span>
            <Badge variant={tile.noteVariant} className="self-start px-2 py-0.5 text-[11px]">
              {tile.note}
            </Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}
