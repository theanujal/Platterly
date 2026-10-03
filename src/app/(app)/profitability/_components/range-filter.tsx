"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RANGE_PRESET_LABEL, type RangePreset } from "@/modules/expenses/date-range";

/**
 * The Profitability date range, all on one row: a period dropdown, then From / To dates and Apply. The range lives in
 * the URL (?range= or ?from=&to=) so a filtered view can be shared; picking a period or applying dates navigates there.
 */
export function RangeFilter({
  preset,
  from,
  to,
  basePath = "/profitability",
  extra = {},
}: {
  preset: RangePreset | "custom";
  from: string;
  to: string;
  /** The page this filter belongs to (Reports reuses it), and any other query values to keep, such as a tab. */
  basePath?: string;
  extra?: Record<string, string>;
}) {
  const router = useRouter();
  const [fromValue, setFromValue] = useState(from);
  const [toValue, setToValue] = useState(to);
  const options: Record<string, string> = { ...RANGE_PRESET_LABEL, ...(preset === "custom" ? { custom: "Custom range" } : {}) };

  const go = (params: URLSearchParams) => {
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
    router.push(params.size > 0 ? `${basePath}?${params}` : basePath);
  };

  function choose(value: string | null) {
    if (!value || value === "custom") return;
    go(new URLSearchParams(value === "all" ? {} : { range: value }));
  }

  function apply() {
    const params = new URLSearchParams();
    if (fromValue) params.set("from", fromValue);
    if (toValue) params.set("to", toValue);
    go(params);
  }

  return (
    <form
      className="flex flex-wrap items-center gap-x-3 gap-y-2"
      data-testid="range-filter"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="flex items-center gap-2">
        <Label htmlFor="range-preset">Period</Label>
        <Select items={options} value={preset} onValueChange={choose}>
          <SelectTrigger id="range-preset" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(options).map(([key, text]) => (
              <SelectItem key={key} value={key}>
                {text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="range-from">From</Label>
        <IconInput icon={CalendarDays} id="range-from" type="date" className="w-44" value={fromValue} onChange={(e) => setFromValue(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="range-to">To</Label>
        <IconInput icon={CalendarDays} id="range-to" type="date" className="w-44" value={toValue} onChange={(e) => setToValue(e.target.value)} />
      </div>
      <Button type="submit" variant="outline">
        Apply dates
      </Button>
    </form>
  );
}
