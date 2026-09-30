import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { cn } from "cn";

/**
 * The page header every Settings page shares, the same as the rest of the app
 * (breadcrumb, title, one-line description, an optional action, a rule), then
 * the page's content. AJ, 2026-09-30: settings follows our design system, not
 * the reference screenshots' card-with-icon header.
 */
export function SettingsCard({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings", href: "/settings" }, { label: title }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      <Separator />
      {children}
    </div>
  );
}

/** The bordered panel a page's fields (view or edit) live in. */
export function SettingsPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-5 rounded-xl border border-border bg-card p-5", className)}>{children}</div>;
}

/** A titled group of fields inside a panel, separated from the one above by a rule. */
export function SettingsSection({ icon: Icon, title, description, children }: { icon?: LucideIcon; title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {Icon && <Icon className="size-4 text-muted-foreground" />}
          {title}
        </h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** A panel's heading: icon, title and a one-line description (the cards on the notification pages). */
export function PanelHeader({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Icon className="size-4.5 text-muted-foreground" />
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/** A read-only field for view mode: small label, then the value, or "Not provided". */
export function Detail({ label, value, className }: { label: string; value?: ReactNode; className?: string }) {
  const empty = value === undefined || value === null || value === "";
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm break-words", empty && "text-muted-foreground")}>{empty ? "Not provided" : value}</dd>
    </div>
  );
}

/** A responsive 2-column grid of Details. */
export function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">{children}</dl>;
}

const TONE: Record<"info" | "success" | "warning" | "neutral", string> = {
  info: "border-info/25 bg-info/10 text-info",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  neutral: "border-border bg-muted/50 text-muted-foreground",
};

/** A tinted callout: tips (info), confirmations (success) or plain notes (neutral). */
export function InfoBox({ tone = "neutral", title, children }: { tone?: keyof typeof TONE; title?: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border p-4 text-sm", TONE[tone])}>
      {title && <h2 className="font-semibold">{title}</h2>}
      {children}
    </div>
  );
}

/** A bullet list for an InfoBox. */
export function InfoList({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-4 marker:text-current">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** The form's status line and button row, identical on every page. */
export function FormFooter({ error, success, children }: { error?: string | null; success?: string | null; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {success && <p className="text-sm text-success">{success}</p>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
