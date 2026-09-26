"use client";

import { useState } from "react";
import { Boxes } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { updateEventOperationsAction } from "../../actions";

interface Row {
  inventoryId: string;
  checked: boolean;
  quantity: string;
}

/**
 * Required inventory (AJ, 2026-09-27): which inventory items, and how much of
 * each, this order's event needs. A card of its own after the form's steps; it
 * saves as you tick an item or leave a quantity, with no save button.
 */
export function RequiredInventoryCard({
  orderId,
  event,
  inventoryItems,
}: {
  orderId: string;
  event: { id: string; requiredInventory: { inventoryId: string; quantity: number }[] } | null;
  inventoryItems: { id: string; name: string; unit: string }[];
}) {
  const [rows, setRows] = useState<Row[]>(() => {
    const existing = new Map((event?.requiredInventory ?? []).map((r) => [r.inventoryId, r.quantity]));
    return inventoryItems.map((item) => ({
      inventoryId: item.id,
      checked: existing.has(item.id),
      quantity: existing.has(item.id) ? String(existing.get(item.id)) : "",
    }));
  });
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(next: Row[]) {
    if (!event) return;
    setState("saving");
    setError(null);
    const result = await updateEventOperationsAction(orderId, event.id, {
      requiredInventory: next.filter((r) => r.checked).map((r) => ({ inventoryId: r.inventoryId, quantity: Number.parseFloat(r.quantity) || 0 })),
    });
    if (!result.ok) {
      setState("error");
      setError(result.error);
      return;
    }
    setState("saved");
  }

  function update(inventoryId: string, patch: Partial<Row>, saveNow: boolean) {
    const next = rows.map((r) => (r.inventoryId === inventoryId ? { ...r, ...patch } : r));
    setRows(next);
    if (saveNow) void save(next);
  }

  return (
    <Card className="gap-4 px-5 [--card-spacing:--spacing(5)]" data-testid="required-inventory-card">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Boxes className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Required Inventory</h2>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Which inventory items, and how much of each, this event needs. Changes save automatically."}
          </p>
        </div>
      </div>

      {!event ? (
        <p className="text-sm text-muted-foreground">Set an Event Type on this order and save it. Its event is created for you, and you can list the inventory it needs here.</p>
      ) : inventoryItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">No inventory items yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
          {rows.map((row) => {
            const item = inventoryItems.find((i) => i.id === row.inventoryId);
            if (!item) return null;
            return (
              <div key={row.inventoryId} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <label htmlFor={`inv-${row.inventoryId}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <Checkbox id={`inv-${row.inventoryId}`} checked={row.checked} onCheckedChange={(checked) => update(row.inventoryId, { checked: checked === true }, true)} />
                  <span className="truncate text-sm font-medium">{item.name}</span>
                </label>
                {row.checked && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      aria-label={`Quantity of ${item.name}`}
                      className="w-24"
                      value={row.quantity}
                      onChange={(e) => update(row.inventoryId, { quantity: e.target.value }, false)}
                      onBlur={() => void save(rows)}
                    />
                    <span className="w-10 text-xs text-muted-foreground">{item.unit}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </Card>
  );
}
