import Link from "next/link";
import { ShoppingCart, FileText, ClipboardList, ChefHat } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Direct shortcuts into the four most common creation flows — folds in what
// used to be the standalone Menu Catalog shortcut card, since "manage
// catalog" is just another quick action, not its own module.
const ACTIONS = [
  { label: "New Order", href: "/orders/new", icon: ShoppingCart },
  { label: "New Quotation", href: "/quotations/new", icon: FileText },
  { label: "New Enquiry", href: "/enquiries", icon: ClipboardList },
  { label: "Menu Catalog", href: "/menu-catalog", icon: ChefHat },
] as const;

export function QuickActionsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-start gap-2 rounded-lg border border-border p-3 text-sm font-medium transition-colors hover:border-primary/30 hover:bg-primary/5"
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
