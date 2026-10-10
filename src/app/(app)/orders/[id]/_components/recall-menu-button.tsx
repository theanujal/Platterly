"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recallMenuAction } from "../../../menu-approvals/actions";

/** "Recall to edit": pulls a menu back from the customer (or from an approval not yet sent to the kitchen) so the planner opens for editing. */
export function RecallMenuButton({ menuSelectionId }: { menuSelectionId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recall() {
    setPending(true);
    setError(null);
    const result = await recallMenuAction(menuSelectionId);
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" disabled={pending} onClick={recall}>
        <Undo2 /> {pending ? "Recalling…" : "Recall to edit"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
