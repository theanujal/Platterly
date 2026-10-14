import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** The longest description each catalog record takes in its form (AJ, 2026-10-14): a line or two for the small records, more for what customers read when choosing dishes. */
export const DESCRIPTION_MAX = { category: 200, addOn: 200, eventType: 200, item: 300, menu: 500 } as const;

/**
 * A catalog description box with its limit shown as "123/300" beside the label, like onboarding's business description.
 * The limit only stops typing: a longer description saved earlier is shown whole and can be saved as it is.
 */
export function DescriptionField({ id, label, value, onChange, max }: { id: string; label: string; value: string; onChange: (value: string) => void; max: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs text-muted-foreground" data-testid={`${id}-count`}>
          {value.length}/{max}
        </span>
      </div>
      <Textarea id={id} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
