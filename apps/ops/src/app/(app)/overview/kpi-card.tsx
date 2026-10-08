import Link from "next/link";
import { ArrowDown, ArrowUp, Building2, CheckCircle2, Crown, IndianRupee, Percent, TrendingDown, Timer, UserPlus, type LucideIcon } from "lucide-react";
import type { Kpi } from "@/modules/dashboard/dashboard";

const ICONS: Record<string, { icon: LucideIcon; tile: string }> = {
  businesses: { icon: Building2, tile: "bg-primary/10 text-primary" },
  active: { icon: CheckCircle2, tile: "bg-success/10 text-success" },
  paying: { icon: Crown, tile: "bg-primary/10 text-primary" },
  mrr: { icon: IndianRupee, tile: "bg-primary/10 text-primary" },
  new: { icon: UserPlus, tile: "bg-info/10 text-info" },
  trials: { icon: Timer, tile: "bg-violet-500/10 text-violet-600" },
  conversion: { icon: Percent, tile: "bg-primary/10 text-primary" },
  churn: { icon: TrendingDown, tile: "bg-destructive/10 text-destructive" },
};

/** One figure: an icon tile, the label, the number, and how it moved since the start of the range (or a short note when it has no history). */
export function KpiCard({ kpi }: { kpi: Kpi }) {
  const { icon: Icon, tile } = ICONS[kpi.key] ?? ICONS.businesses;
  const d = kpi.delta;
  const up = d ? d.value > 0 : false;
  const flat = !d || d.value === 0;
  const good = flat ? null : kpi.lowerIsBetter ? !up : up;
  return (
    <Link href={kpi.href} className="block">
      <section className="flex h-full items-center gap-4 rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgba(17,24,39,0.1)] transition-shadow hover:shadow-[0_0_0_1px_rgba(255,105,0,0.4)]">
        <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${tile}`}><Icon className="size-6" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-muted-foreground">{kpi.label}</p>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <p className="text-3xl font-semibold leading-tight">{kpi.display}</p>
            {d ? (
              <p className={`flex items-center gap-1 text-sm font-medium ${flat ? "text-muted-foreground" : good ? "text-success" : "text-destructive"}`}>
                {flat ? null : up ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />}
                {d.pct === null ? (flat ? "No change" : `${up ? "+" : ""}${d.value.toLocaleString("en-IN")}`) : `${Math.abs(d.pct)}%`}
                <span className="font-normal text-muted-foreground">{flat ? "" : "vs start"}</span>
              </p>
            ) : kpi.hint ? <p className="text-xs text-muted-foreground">{kpi.hint}</p> : null}
          </div>
        </div>
      </section>
    </Link>
  );
}
