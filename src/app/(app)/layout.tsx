import { cookies } from "next/headers";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/app-shell/app-sidebar";

// Shared shell for every caterer-facing, signed-in page (Dashboard, Menu
// Catalog, Settings) — a collapsible left sidebar (AJ's explicit request,
// 2026-09-14) replacing the previous pattern of each top-level route having
// no shared chrome at all. A Next.js route group ((app)) so the URLs
// (/dashboard, /menu-catalog, /settings) are unchanged — this only changes
// where the files live and what wraps them. Each page underneath still
// calls its own requireActiveOrganization()/requirePermission() checks;
// this layout's own call is for the header/org name, not a replacement for
// those per-page gates (defense in depth, same convention Settings' and
// Menu Catalog's own layouts already used before this change).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { organizationId } = await requireActiveOrganization();
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true },
  });

  const cookieStore = await cookies();
  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const defaultOpen = sidebarState !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar organizationName={organization.name} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-medium text-muted-foreground">{organization.name}</span>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
