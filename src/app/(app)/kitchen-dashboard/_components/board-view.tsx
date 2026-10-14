"use client";

import { useState, type ReactNode } from "react";
import { ViewToggle } from "@/components/catalog/view-toggle";

/** Grid / List switch for the Kitchen Dashboard: both views are built on the server and this only shows one. */
export function BoardView({ grid, list }: { grid: ReactNode; list: ReactNode }) {
  const [view, setView] = useState<"grid" | "list">("grid");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <ViewToggle view={view} onChange={setView} />
      </div>
      {view === "grid" ? grid : list}
    </div>
  );
}
