import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "cn";

/**
 * Create / edit Order layout pieces (AJ, 2026-09-27 reference). Built only from
 * design-system tokens: Card's ring + radius-xl, the primary tint (`bg-primary/10`)
 * for the step number and icon chips, `text-base font-semibold` headings.
 */

/** A numbered step card in the form's main column. */
export function FormSection({
  step,
  title,
  description,
  action,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // overflow-visible overrides Card's default overflow-hidden (there for
    // rounded-corner image clipping, which no step card ever has) — without
    // it, CustomerCombobox's absolutely-positioned results dropdown gets
    // clipped the moment it would extend past this card's own box.
    <Card className="gap-5 overflow-visible px-5 [--card-spacing:--spacing(5)]">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{step}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** A card in the right-hand summary column: icon chip + title, then rows. */
export function SummaryCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-4 px-5 [--card-spacing:--spacing(5)]">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

/** One label / value line in a summary card. */
export function SummaryRow({ icon: Icon, label, className, children }: { icon?: LucideIcon; label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-start gap-3 text-sm", className)}>
      {Icon && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
      )}
      <span className="w-20 shrink-0 pt-1 text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1 font-medium">{children}</div>
    </div>
  );
}
