import Link from "next/link";
import { Zap, ShoppingCart, FileText, ClipboardList, ChefHat } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardCardHeader } from "./dashboard-card-header";

// Direct shortcuts into the four most common creation flows — folds in what
// used to be the standalone Menu Catalog shortcut card, since "manage
// catalog" is just another quick action, not its own module.
const ACTIONS = [
  { label: "New Order", href: "/orders/new", icon: ShoppingCart },
  { label: "New Quotation", href: "/quotations/new", icon: FileText },
  { label: "New Enquiry", href: "/enquiries", icon: ClipboardList },
  { label: "Menu Catalog", href: "/menu-catalog", icon: ChefHat },
] as const;

// AJ, 2026-09-16 (Agentation feedback) — moved above Needs Attention and
// given the same colored icon-chip header as the KPI/module cards, plus a
// tinted border/background, so it reads as more prominent than a plain
// utility card.
export function QuickActionsCard() {
  return (
    <Card className="border-primary/20 bg-primary/[0.03]">
      <DashboardCardHeader icon={Zap} title="Quick Actions" colorClassName="bg-primary/10 text-primary" />
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-start gap-2 rounded-lg border border-border bg-background p-3 text-sm font-medium transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <action.icon className="size-4 text-primary" />
              {action.label}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
