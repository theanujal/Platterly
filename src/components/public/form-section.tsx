import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

/** The white card a public form's sections sit in. */
export function FormCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-6 rounded-xl bg-card p-5 ring-1 ring-foreground/10 md:p-6", className)}>{children}</div>
  );
}

/**
 * One row of a public form: an icon tile with the section's title and a line of help on the left, the fields on
 * the right (stacked on a phone). Rows are divided by a hairline, like the Plan Your Event reference.
 */
export function FormSection({
  icon: Icon,
  title,
  optional,
  required,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  optional?: boolean;
  required?: boolean;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 border-t border-border pt-6 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-8">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight">
            {title}
            {optional && <span className="ml-1 text-sm font-normal text-muted-foreground">(Optional)</span>}
            {required && <span className="ml-1 text-destructive">*</span>}
          </h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}
