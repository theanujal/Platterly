import type { ReactNode } from "react";
import { PageBreadcrumb, type BreadcrumbItem } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";

/** The page header every Super Admin page shares, the same as the rest of the app: breadcrumb, title, one line, an action, a rule. */
export function PageHeader({ crumbs, title, description, action }: { crumbs: BreadcrumbItem[]; title: ReactNode; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <PageBreadcrumb items={[{ label: "Super Admin", href: "/super/dashboard" }, ...crumbs]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <Separator />
    </div>
  );
}
