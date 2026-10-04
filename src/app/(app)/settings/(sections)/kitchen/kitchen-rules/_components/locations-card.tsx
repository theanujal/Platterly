"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { InfoBox, PanelHeader, SettingsPanel } from "../../../../_components/settings-ui";
import { addLocationAction, deleteLocationAction, makeDefaultLocationAction, renameLocationAction, setMultiLocationAction, type ActionResult } from "../actions";

interface LocationRow {
  id: string;
  name: string;
  isDefault: boolean;
}

/** Chunk 23 — the opt-in switch and the list of locations. Only the owner can change either. */
export function LocationsCard({ planAllows, enabled, canEdit, locations }: { planAllows: boolean; enabled: boolean; canEdit: boolean; locations: LocationRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function run(action: () => Promise<ActionResult>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  return (
    <SettingsPanel>
      <PanelHeader icon={MapPin} title="Locations" description="Only for kitchens that work from more than one place." />
      {!planAllows && (
        <InfoBox tone="neutral" title="Not on your plan">
          <p>Multiple locations are not part of your current plan. Upgrade your plan to switch them on.</p>
        </InfoBox>
      )}
      <label htmlFor="multi-location" className="flex items-start gap-3">
        <Switch id="multi-location" checked={enabled} disabled={!planAllows || !canEdit || pending} onCheckedChange={(checked) => run(() => setMultiLocationAction(checked === true))} />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">We operate from more than one location</span>
          <span className="text-xs text-muted-foreground">Adds a location switcher at the top, and a location on events, inventory items and team members. Anything without a location stays open to the whole kitchen.</span>
        </span>
      </label>

      {enabled && (
        <div className="flex flex-col gap-3 border-t border-border pt-5">
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {locations.map((location) => (
              <li key={location.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                {editingId === location.id ? (
                  <>
                    <Input aria-label="Location name" className="max-w-64" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <Button size="md" disabled={pending} onClick={() => run(() => renameLocationAction(location.id, editName), () => setEditingId(null))}>
                      Save
                    </Button>
                    <Button size="md" variant="outline" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium">{location.name}</span>
                    {location.isDefault && <Badge variant="info">Default</Badge>}
                    {canEdit && (
                      <span className="ml-auto flex flex-wrap gap-1">
                        {!location.isDefault && (
                          <Button size="md" variant="outline" disabled={pending} onClick={() => run(() => makeDefaultLocationAction(location.id))}>
                            Make default
                          </Button>
                        )}
                        <Button size="md" variant="outline" aria-label={`Rename ${location.name}`} onClick={() => { setEditingId(location.id); setEditName(location.name); }}>
                          <Pencil />
                        </Button>
                        {!location.isDefault && (
                          <Button size="md" variant="outline" aria-label={`Delete ${location.name}`} disabled={pending} onClick={() => { if (window.confirm(`Delete ${location.name}? Its events, inventory items and team members become unassigned.`)) run(() => deleteLocationAction(location.id)); }}>
                            <Trash2 />
                          </Button>
                        )}
                      </span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                run(() => addLocationAction(newName), () => setNewName(""));
              }}
            >
              <Input aria-label="New location name" className="max-w-64" placeholder="New location name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Button type="submit" size="md" disabled={pending || newName.trim() === ""}>
                <Plus /> Add Location
              </Button>
            </form>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </SettingsPanel>
  );
}
