import { Info } from "lucide-react";

/** The white, bordered "Note:" callout that closes the Invite and Privacy tabs. */
export function TeamNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground">
      <Info className="mt-0.5 size-4 shrink-0" />
      <p>
        <b className="font-semibold">Note:</b> {children}
      </p>
    </div>
  );
}
