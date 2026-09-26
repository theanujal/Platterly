import { cn } from "cn";

/**
 * Order-density bands shared by every calendar surface (Dashboard card,
 * Create Order date picker, /calendar page). `line` is the short marker
 * under a date; `fill` is the solid highlight used only for today.
 */
export const DENSITY_BANDS = [
  { label: "1 order", line: "bg-emerald-500", fill: "bg-emerald-500 text-white" },
  { label: "2-3 orders", line: "bg-amber-400", fill: "bg-amber-400 text-white" },
  { label: "4-6 orders", line: "bg-orange-500", fill: "bg-orange-500 text-white" },
  { label: "7+ orders", line: "bg-rose-600", fill: "bg-rose-600 text-white" },
] as const;

export function densityBand(count: number) {
  if (count <= 0) return null;
  if (count === 1) return DENSITY_BANDS[0];
  if (count <= 3) return DENSITY_BANDS[1];
  if (count <= 6) return DENSITY_BANDS[2];
  return DENSITY_BANDS[3];
}

/** The line under a date number. Position it inside a `relative` parent. */
export function DensityLine({ count, faded, className }: { count: number; faded?: boolean; className?: string }) {
  const band = densityBand(count);
  if (!band) return null;
  return <span aria-hidden className={cn("absolute bottom-1 h-[3px] w-4 rounded-full", band.line, faded && "opacity-50", className)} />;
}

export function DensityLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground", className)}>
      {DENSITY_BANDS.map((band) => (
        <span key={band.label} className="flex items-center gap-1.5">
          <span className={cn("h-[3px] w-3.5 rounded-full", band.line)} /> {band.label}
        </span>
      ))}
    </div>
  );
}
