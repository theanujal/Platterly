import { cookies } from "next/headers";
import { requireSuperAdminOrRedirect } from "../_lib/guard";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { SuperSidebar } from "./_components/super-sidebar";

// Every page under this route group is gated by requireSuperAdminOrRedirect(). The `(admin)` segment adds no URL
// path, so no RESERVED_PATH_SEGMENTS entry is needed for it. The shell follows the caterer app's own (design system §13):
// a sidebar (a drawer below 1024px), a header strip, then the page.
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSuperAdminOrRedirect();
  const sidebarState = (await cookies()).get("sidebar_state")?.value;

  return (
    <SidebarProvider defaultOpen={sidebarState !== "false"}>
      <SuperSidebar userName={session.user.name} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur-sm">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm text-muted-foreground">{session.user.email}</span>
        </header>
        <main className="flex flex-1 flex-col gap-6 p-6 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
