import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { DashboardCardHeader } from "./dashboard-card-header";

type StatusTone = "teal" | "indigo";

const TONE_STYLES: Record<StatusTone, { iconChip: string; progressFill: string; progressTrack: string; primaryValue: string }> = {
  teal: {
    iconChip: "bg-teal-500/10 text-teal-600",
    progressFill: "bg-teal-600",
    progressTrack: "bg-teal-100",
    primaryValue: "text-teal-900",
  },
  indigo: {
    iconChip: "bg-indigo-500/10 text-indigo-600",
    progressFill: "bg-indigo-600",
    progressTrack: "bg-indigo-100",
    primaryValue: "text-indigo-900",
  },
};

interface StatusChipData {
  icon: LucideIcon;
  label: string;
  value: string | number;
}

interface StatusRowData {
  key: string;
  title: string;
  subtitle: string;
  badgeLabel: string;
}

interface StatusOverviewCardProps {
  tone: StatusTone;
  title: string;
  icon: LucideIcon;
  primaryLabel: string;
  primaryValue: string;
  /** 0-100, clamped internally. */
  progressPercent: number;
  redChip: StatusChipData;
  orangeChip: StatusChipData;
  rows: StatusRowData[];
  emptyMessage: string;
  footerHref: string;
  footerLabel: string;
}

// Shared "status" card shell (Inventory Status / Partial Payments) — AJ,
// 2026-09-16, matching a reference screenshot: icon-chip header, a headline
// stat over a progress bar, two tinted alert chips, then a short list of
// the specific records driving those chips. Correction round 2 (AJ,
// 2026-09-17): the header now uses the same shared `DashboardCardHeader`
// every other Dashboard card uses (light-tint icon chip, left of the
// title) instead of a bespoke dark/solid chip pinned to the header's right
// side — the reference screenshot's placement didn't match the rest of the
// page, and AJ asked for it to be made consistent.
export function StatusOverviewCard({
  tone,
  title,
  icon: Icon,
  primaryLabel,
  primaryValue,
  progressPercent,
  redChip,
  orangeChip,
  rows,
  emptyMessage,
  footerHref,
  footerLabel,
}: StatusOverviewCardProps) {
  const styles = TONE_STYLES[tone];
  const clampedPercent = Math.min(100, Math.max(0, progressPercent));

  return (
    <Card>
      <DashboardCardHeader icon={Icon} title={title} colorClassName={styles.iconChip} />
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">{primaryLabel}</span>
            <span className={cn("text-lg font-semibold", styles.primaryValue)}>{primaryValue}</span>
          </div>
          <div className={cn("h-1.5 w-full overflow-hidden rounded-full", styles.progressTrack)}>
            <div className={cn("h-full rounded-full", styles.progressFill)} style={{ width: `${clampedPercent}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { chip: redChip, chipBg: "bg-rose-50", iconBg: "bg-rose-100", iconColor: "text-rose-600", valueColor: "text-rose-600" },
            {
              chip: orangeChip,
              chipBg: "bg-amber-50",
              iconBg: "bg-amber-100",
              iconColor: "text-amber-600",
              valueColor: "text-amber-600",
            },
          ].map(({ chip, chipBg, iconBg, iconColor, valueColor }) => (
            <div key={chip.label} className={cn("flex items-center gap-2.5 rounded-lg p-3", chipBg)}>
              <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", iconBg, iconColor)}>
                <chip.icon className="size-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">{chip.label}</span>
                <span className={cn("text-lg font-semibold", valueColor)}>{chip.value}</span>
              </div>
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg bg-muted/50 px-3 py-3 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2.5">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{row.title}</span>
                  <span className="text-xs text-muted-foreground">{row.subtitle}</span>
                </div>
                <span className="shrink-0 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700">
                  {row.badgeLabel}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Base UI's Button + nativeButton={false} sets role="button" on the
            rendered <a> — deliberate, not a style choice: a bare <Link> here
            keeps native role="link", which collides under accessible-name
            substring matching with the sidebar's own "Inventory" nav link
            (e.g. this card's "Manage inventory" vs. the sidebar's
            "Inventory") — caught by inventory.spec.ts's real strict-mode
            failure, not hypothetical. */}
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={footerHref} />}
          nativeButton={false}
          className="h-auto justify-start gap-1 self-start p-0 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          {footerLabel}
          <ArrowRight className="size-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}
