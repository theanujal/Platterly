"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** The words shown on hover for an icon-only button (the button keeps its own aria-label). A short delay keeps it calm when the mouse crosses a row. */
export function IconTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger delay={300} render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
