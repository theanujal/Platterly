import { Search } from "lucide-react";
import { formatWhen, inputClass } from "@/components/ui";
import { getSelectedProduct, listSwitcherProducts } from "@/lib/selected-product";
import { requireStaff } from "@/lib/session";
import { countUnread, listNotifications } from "@/modules/notifications/notifications";
import { AppNav } from "./app-nav";
import { NotificationBell } from "./notification-bell";
import { ProductSwitcher } from "./product-switcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const [selected, products] = await Promise.all([getSelectedProduct(), listSwitcherProducts()]);
  const [unread, latest] = await Promise.all([countUnread(selected?.key), listNotifications({ productKey: selected?.key, take: 6 })]);
  const initials = staff.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const nav = { unread, productName: selected?.name ?? null, staffName: staff.name, staffEmail: staff.email };
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <div className="mb-4 px-3">
          <p className="text-base font-bold">Platterly</p>
          <p className="text-xs text-muted-foreground">Ops</p>
        </div>
        <div className="mb-2"><ProductSwitcher products={products} selectedKey={selected?.key ?? null} /></div>
        <AppNav {...nav} />
      </aside>
      <div className="min-w-0 flex-1">
        <div className="border-b border-sidebar-border bg-sidebar px-4 py-3 lg:hidden">
          <div className="mb-3"><ProductSwitcher products={products} selectedKey={selected?.key ?? null} compact /></div>
          <AppNav {...nav} compact />
        </div>
        <header className="flex items-center gap-3 border-b border-border bg-white/60 px-4 py-3 sm:px-6">
          <form action="/businesses" role="search" className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input name="q" aria-label="Search businesses" placeholder="Search businesses by name or owner email" className={`${inputClass} pl-9`} />
          </form>
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell
              unread={unread}
              items={latest.map((n) => ({ id: n.id, title: n.title, body: n.body, severity: n.severity, when: formatWhen(n.createdAt), href: n.link, read: Boolean(n.readAt) }))}
            />
            <span className="hidden items-center gap-2 sm:flex" title={staff.email}>
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initials}</span>
              <span className="hidden text-sm font-medium md:block">{staff.name}</span>
            </span>
          </div>
        </header>
        <main className="w-full p-4 sm:p-6 xl:px-8">{children}</main>
      </div>
    </div>
  );
}
