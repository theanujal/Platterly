"use client";

import { Bell } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

// Real, honest empty state — there's no in-app notification feed wired up
// yet (only outbound WhatsApp/email logs to customers), so this never fakes
// an unread count or a list of alerts. It's a real affordance whose true
// current state is "nothing yet," same pattern as every other empty state
// on this dashboard.
export function NotificationBell() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Notifications"
        className="relative flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-4" />
      </PopoverTrigger>
      <PopoverContent>
        <p className="text-sm font-medium">Notifications</p>
        <p className="mt-1 text-xs text-muted-foreground">You&apos;re all caught up — nothing new right now.</p>
      </PopoverContent>
    </Popover>
  );
}
