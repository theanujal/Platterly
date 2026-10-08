import Link from "next/link";
import { BellOff, Check } from "lucide-react";
import { Badge, Button, Empty, PageHeader, formatWhen } from "@/components/ui";
import { getSelectedProduct } from "@/lib/selected-product";
import { listNotifications } from "@/modules/notifications/notifications";
import { markAllReadAction, markReadAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

const TONE = { INFO: "info", WARNING: "warning", CRITICAL: "danger" } as const;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const unreadOnly = show === "unread";
  const selected = await getSelectedProduct();
  const rows = await listNotifications({ productKey: selected?.key, unreadOnly });
  const tab = (value: string | undefined, text: string) => (
    <Link href={value ? `/notifications?show=${value}` : "/notifications"} aria-current={show === value || (!show && !value) ? "page" : undefined} className={`flex h-8 items-center rounded-lg px-3 text-[13px] font-medium ${show === value || (!show && !value) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{text}</Link>
  );
  return (
    <>
      <PageHeader
        title="Notifications"
        description={selected ? `What happened on ${selected.name}.` : "What happened across every product: sign-ups, payments, trials and problems."}
        actions={
          <>
            <nav aria-label="Filter" className="flex gap-1 rounded-[10px] border border-border bg-white p-1">{tab(undefined, "All")}{tab("unread", "Unread")}</nav>
            <form action={markAllReadAction}><Button type="submit" variant="outline" size="md">Mark all read</Button></form>
          </>
        }
      />
      {rows.length === 0 ? (
        <Empty><BellOff className="mx-auto mb-2 size-5" aria-hidden />{unreadOnly ? "You are all caught up." : "Nothing yet. Notifications appear here as things happen."}</Empty>
      ) : (
        <ul className="divide-y divide-border rounded-xl bg-card shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
          {rows.map((n) => (
            <li key={n.id} className={`flex items-start gap-3 p-4 ${n.readAt ? "" : "bg-primary/[0.03]"}`}>
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-primary"}`} aria-label={n.readAt ? "Read" : "Unread"} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}</p>
                  <Badge tone={TONE[n.severity]}>{n.severity === "INFO" ? "Info" : n.severity === "WARNING" ? "Warning" : "Critical"}</Badge>
                  {n.product ? <Badge>{n.product.name}</Badge> : null}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{n.body}{n.business ? <> · <Link href={`/businesses/${n.business.id}`} className="text-accent-foreground hover:underline">{n.business.name}</Link></> : null}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatWhen(n.createdAt)}</p>
              </div>
              {n.readAt ? null : <form action={markReadAction}><input type="hidden" name="id" value={n.id} /><Button type="submit" variant="outline" size="md"><Check className="size-4" aria-hidden />Mark read</Button></form>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
