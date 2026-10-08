import { Button, inputClass } from "@/components/ui";
import { RANGE_PRESETS, toIsoDate, type RangePreset } from "@/modules/reports/range";

/** The period form shared by every report page: a preset, or a From and To date that override it. */
export function PeriodFilters({ range, from, to }: { range: { preset: RangePreset | "custom"; from: Date | null; to: Date | null }; from?: string; to?: string }) {
  return (
    <>
      <form className="mb-2 flex flex-wrap items-end gap-3" role="search" aria-label="Report filters">
        <div className="flex flex-col gap-1.5"><label htmlFor="range" className="text-sm font-medium">Period</label>
          <select id="range" name="range" defaultValue={range.preset === "custom" ? "this-month" : range.preset} className={`${inputClass} w-52!`}>{RANGE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        </div>
        <div className="flex flex-col gap-1.5"><label htmlFor="from" className="text-sm font-medium">From</label><input id="from" name="from" type="date" defaultValue={from ?? ""} className={`${inputClass} w-40!`} /></div>
        <div className="flex flex-col gap-1.5"><label htmlFor="to" className="text-sm font-medium">To</label><input id="to" name="to" type="date" defaultValue={to ?? ""} className={`${inputClass} w-40!`} /></div>
        <Button type="submit" size="md" variant="outline">Apply</Button>
      </form>
      <p className="mb-5 text-xs text-muted-foreground">A From or To date overrides the period. {range.from ? `Showing ${toIsoDate(range.from)}${range.to ? ` to ${toIsoDate(range.to)}` : " onwards"}.` : "Showing all time."}</p>
    </>
  );
}
