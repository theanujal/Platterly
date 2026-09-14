import type { LucideIcon } from "lucide-react";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "cn";

interface DashboardCardHeaderProps {
  icon: LucideIcon;
  title: string;
  colorClassName: string;
}

// Shared icon-chip + title header used by every stat card on the Dashboard
// grid — kept as one small component since all 6 cards share the exact same
// visual pattern; not meant for reuse outside this page.
export function DashboardCardHeader({ icon: Icon, title, colorClassName }: DashboardCardHeaderProps) {
  return (
    <CardHeader>
      <div className="flex items-center gap-2.5">
        <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", colorClassName)}>
          <Icon className="size-4" />
        </div>
        <CardTitle>{title}</CardTitle>
      </div>
    </CardHeader>
  );
}
