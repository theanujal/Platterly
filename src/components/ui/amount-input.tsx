import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "cn";

export type AmountMode = "FIXED" | "PERCENTAGE";

/**
 * An amount box with its unit joined on the left, the number right-aligned (AJ, 2026-10-16). With `onMode` the unit is a
 * ₹ / % dropdown; without it the unit is a plain ₹ and the amount is always a rupee price.
 */
export function AmountInput({
  id,
  label,
  mode = "FIXED",
  onMode,
  value,
  onValue,
  required,
  className,
}: {
  id: string;
  /** The accessible name of the number box (the visible label sits next to the control). */
  label: string;
  mode?: AmountMode;
  onMode?: (mode: AmountMode) => void;
  value: string;
  onValue: (value: string) => void;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center", className)}>
      {onMode ? (
        <Select items={{ FIXED: "₹", PERCENTAGE: "%" }} value={mode} onValueChange={(v) => onMode(v === "PERCENTAGE" ? "PERCENTAGE" : "FIXED")}>
          <SelectTrigger aria-label={`${label} type`} className="w-16 rounded-r-none border-r-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FIXED">₹</SelectItem>
            <SelectItem value="PERCENTAGE">%</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <span aria-hidden className="flex h-10 w-16 items-center justify-center rounded-l-lg border border-r-0 border-input bg-muted text-sm text-muted-foreground">
          ₹
        </span>
      )}
      <Input
        id={id}
        aria-label={label}
        type="number"
        min="0"
        max={mode === "PERCENTAGE" ? 100 : undefined}
        step="0.01"
        required={required}
        className="w-36 rounded-l-none text-right"
        value={value}
        onChange={(e) => onValue(e.target.value)}
      />
    </div>
  );
}
