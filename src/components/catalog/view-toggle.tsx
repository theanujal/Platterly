"use client";

import { LayoutGrid, List as ListIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The Grid / List switch every catalog page has (Menu Types, Food Items, Orders, ...): a bordered pair of buttons,
 * the chosen one filled with the primary color. Shared so the public "Choose Your Menu" step uses the very same one.
 */
export function ViewToggle({ view, onChange }: { view: "grid" | "list"; onChange: (view: "grid" | "list") => void }) {
  return (
    <div className="flex shrink-0 gap-1 rounded-lg border border-input p-0.5">
      <Button
        type="button"
        variant={view === "grid" ? "default" : "ghost"}
        size="sm"
        className="h-10 gap-1.5 px-3 text-sm"
        aria-pressed={view === "grid"}
        aria-label="Grid view"
        onClick={() => onChange("grid")}
      >
        <LayoutGrid className="size-4" />
        Grid
      </Button>
      <Button
        type="button"
        variant={view === "list" ? "default" : "ghost"}
        size="sm"
        className="h-10 gap-1.5 px-3 text-sm"
        aria-pressed={view === "list"}
        aria-label="List view"
        onClick={() => onChange("list")}
      >
        <ListIcon className="size-4" />
        List
      </Button>
    </div>
  );
}
