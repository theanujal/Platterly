"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reorderEventTypesAction } from "../actions";

interface EventTypeReorderButtonsProps {
  orderedIds: string[];
  eventTypeId: string;
}

/**
 * Move-up/down only (no drag — see event-type.ts's `reorderEventTypes`
 * comment). Lives inside a list-view row whose <TableRow> navigates on
 * click when `CatalogEntry.href` is set — `stopPropagation` keeps a
 * reorder click from also triggering that row navigation.
 */
export function EventTypeReorderButtons({ orderedIds, eventTypeId }: EventTypeReorderButtonsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const index = orderedIds.indexOf(eventTypeId);

  async function move(direction: -1 | 1) {
    const next = [...orderedIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPending(true);
    await reorderEventTypesAction(next);
    setPending(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={pending || index === 0}
        aria-label={`Move up`}
        onClick={() => move(-1)}
      >
        <ChevronUp className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={pending || index === orderedIds.length - 1}
        aria-label={`Move down`}
        onClick={() => move(1)}
      >
        <ChevronDown className="size-4" />
      </Button>
    </div>
  );
}
