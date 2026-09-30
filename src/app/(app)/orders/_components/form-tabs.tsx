"use client";

import { useState } from "react";
import { cn } from "cn";

export interface FormTab {
  id: string;
  label: string;
  panel: React.ReactNode;
}

/**
 * Tabbed layout shared by the Order and Quotation forms (AJ, 2026-09-30).
 * Every panel stays mounted (just hidden) so nothing typed in one tab is lost on switching.
 */
export function FormTabs({ tabs, idPrefix }: { tabs: FormTab[]; idPrefix: string }) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <>
      <div role="tablist" aria-label="Sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${idPrefix}-panel-${tab.id}`}
          aria-labelledby={`${idPrefix}-tab-${tab.id}`}
          hidden={active !== tab.id}
          className="flex min-w-0 flex-col gap-4"
        >
          {tab.panel}
        </div>
      ))}
    </>
  );
}
