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

// AJ, 2026-09-17 — matches the reference screenshot's placement exactly:
// its own full-width row directly under the KPI grid (previously stacked at
// the bottom of the right-hand column below Public Menu/QR and Needs
// Attention), all 4 actions in a single row (was a 2x2 grid). `shrink-0` is
// load-bearing, not decorative: as a bare flex child of the page's <main>
// (rather than a CSS Grid cell, which every other dashboard card sits in),
// this card is exposed to a real flexbox edge case — `overflow-hidden`
// (every Card's own default) nullifies a flex item's automatic
// content-based minimum height, so when the page's scroll gets locked (e.g.
// the "Claim your custom link" dialog that auto-opens for a brand-new
// account) and total content exceeds the viewport, the browser silently
// shrinks this card down to near-zero instead of just letting the page
// scroll. Caught live via a real headed-browser screenshot during a
// brand-new-signup walkthrough, not hypothetical.
export function QuickActionsCard() {
  return (
    <Card className="shrink-0 border-primary/20 bg-primary/[0.03]">
      <DashboardCardHeader icon={Zap} title="Quick Actions" colorClassName="bg-primary/10 text-primary" />
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
