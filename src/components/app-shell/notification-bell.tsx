"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

export interface BellItem {
  id: string;
  title: string;
  message: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}

const REFRESH_MS = 60_000;

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

// The in-app notification feed (Chunk 16.5): the person's own alerts, newest first, with an unread count.
// The shell re-reads it every minute, so a new order shows up without a page reload.
export function NotificationBell({
  items,
  unread,
  onRead,
  onReadAll,
}: {
  items: BellItem[];
  unread: number;
  onRead: (id: string) => Promise<void>;
  onReadAll: () => Promise<void>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  function open(item: BellItem) {
    startTransition(async () => {
      if (!item.read) await onRead(item.id);
      if (item.href) router.push(item.href);
    });
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative flex size-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary transition-colors hover:bg-primary/20"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground ring-2 ring-background">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-sm font-medium">Notifications</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => startTransition(() => onReadAll())}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">You&apos;re all caught up — nothing new right now.</p>
        ) : (
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => open(item)} className="flex w-full gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read ? "bg-transparent" : "bg-primary"}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${item.read ? "" : "font-medium"}`}>{item.title}</span>
                    {item.message && <span className="block text-xs text-muted-foreground">{item.message}</span>}
                    <span suppressHydrationWarning className="mt-0.5 block text-[11px] text-muted-foreground">{ago(item.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
