import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// The one "View …" footer link every Dashboard card uses (Inventory Status,
// Partial Payments, Orders Calendar) so they can't drift apart in style.
// Base UI's Button + nativeButton={false} sets role="button" on the rendered
// <a> — deliberate, not a style choice: a bare <Link> keeps native
// role="link", which collides under accessible-name substring matching with
// the sidebar's own nav links (e.g. "Manage inventory" vs. the sidebar's
// "Inventory") — caught by inventory.spec.ts's real strict-mode failure.
export function CardFooterLink({ href, label }: { href: string; label: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      render={<Link href={href} />}
      nativeButton={false}
      className="h-auto justify-start gap-1 self-start p-0 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
    >
      {label}
      <ArrowRight className="size-3.5" />
    </Button>
  );
}
