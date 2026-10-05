import { requireStaff } from "@/lib/session";
import { countOpenAlerts } from "@/modules/alerts/alerts";
import { AppNav } from "./app-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const openAlerts = await countOpenAlerts();
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <div className="mb-6 px-3">
          <p className="text-base font-bold">Platterly</p>
          <p className="text-xs text-muted-foreground">Ops</p>
        </div>
        <AppNav openAlerts={openAlerts} staffName={staff.name} staffEmail={staff.email} />
      </aside>
      <div className="min-w-0 flex-1">
        <div className="border-b border-sidebar-border bg-sidebar px-4 py-3 lg:hidden">
          <AppNav openAlerts={openAlerts} staffName={staff.name} staffEmail={staff.email} compact />
        </div>
        <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
