"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsPanel } from "./settings-ui";

const StopEditing = createContext<() => void>(() => {});

/** Called by an edit form's Cancel button and after a successful save, to return to the read-only view. */
export function useStopEditing() {
  return useContext(StopEditing);
}

/**
 * View / edit mode for a settings page (AJ, 2026-09-30): a compact read-only
 * view with an Edit button top-right (beside an optional heading); the edit form replaces it in place and
 * hands control back through `useStopEditing`. Both sides are passed in as
 * elements, so the page can render the view on the server.
 */
export function EditablePanel({ heading, view, edit, editLabel, badge }: { heading?: ReactNode; view: ReactNode; edit: ReactNode; editLabel: string; badge?: ReactNode }) {
  const [editing, setEditing] = useState(false);

  return (
    <SettingsPanel>
      {editing ? (
        <StopEditing.Provider value={() => setEditing(false)}>{edit}</StopEditing.Provider>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">{heading}</div>
            <div className="flex shrink-0 items-center gap-2">
              {badge}
              <Button variant="outline" size="md" onClick={() => setEditing(true)}>
                <Pencil data-icon="inline-start" />
                {editLabel}
              </Button>
            </div>
          </div>
          {view}
        </>
      )}
    </SettingsPanel>
  );
}
