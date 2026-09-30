"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reorderMenusAction } from "../actions";

interface MenuReorderButtonsProps {
  orderedIds: string[];
  menuId: string;
  name: string;
}

/**
 * Move a menu up or down in the order customers see on the storefront (AJ, 2026-10-01). Buttons only, no drag —
 * the same as Event Types. Sits in a list row that opens the menu on click, so `stopPropagation` keeps a move from
 * also navigating.
 */
export function MenuReorderButtons({ orderedIds, menuId, name }: MenuReorderButtonsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const index = orderedIds.indexOf(menuId);

  async function move(direction: -1 | 1) {
    const next = [...orderedIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPending(true);
    await reorderMenusAction(next);
    setPending(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <Button type="button" variant="ghost" size="icon-sm" disabled={pending || index === 0} aria-label={`Move ${name} up`} onClick={() => move(-1)}>
        <ChevronUp className="size-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" disabled={pending || index === orderedIds.length - 1} aria-label={`Move ${name} down`} onClick={() => move(1)}>
        <ChevronDown className="size-4" />
      </Button>
    </div>
  );
}
