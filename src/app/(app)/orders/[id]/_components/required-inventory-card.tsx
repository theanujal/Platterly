"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { updateEventOperationsAction } from "../../actions";

interface Row {
  inventoryId: string;
  quantity: string;
}

/**
 * Extra items (AJ, 2026-09-27, renamed 2026-10-10): inventory items, and how much of each, this order's event needs on top of
 * its recipes (gas, disposables, crockery). They are added to the "Required for this order" list and sent with the rest.
 * A kitchen can have hundreds of inventory items, so items are found by typing in a search box (AJ, 2026-10-16) and the chosen ones are listed below it.
 * It saves as you add an item, remove one or leave a quantity, with no save button, and the list above refreshes.
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
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => (event?.requiredInventory ?? []).map((r) => ({ inventoryId: r.inventoryId, quantity: String(r.quantity) })));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(next: Row[]) {
    if (!event) return;
    setState("saving");
    setError(null);
    const result = await updateEventOperationsAction(orderId, event.id, {
      requiredInventory: next.map((r) => ({ inventoryId: r.inventoryId, quantity: Number.parseFloat(r.quantity) || 0 })),
    });
    if (!result.ok) {
      setState("error");
      setError(result.error);
      return;
    }
    setState("saved");
    router.refresh();
  }

  function add(inventoryId: string) {
    if (!inventoryId || rows.some((r) => r.inventoryId === inventoryId)) return;
    const next = [...rows, { inventoryId, quantity: "" }];
    setRows(next);
    void save(next);
  }

  function remove(inventoryId: string) {
    const next = rows.filter((r) => r.inventoryId !== inventoryId);
    setRows(next);
    void save(next);
  }

  const available = inventoryItems.filter((i) => !rows.some((r) => r.inventoryId === i.id)).map((i) => ({ value: i.id, label: i.name, hint: i.unit }));

  return (
    <Card className="gap-4 px-5 [--card-spacing:--spacing(5)]" data-testid="required-inventory-card">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Boxes className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Extra items</h2>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {state === "saving"
              ? "Saving…"
              : state === "saved"
                ? "Saved"
                : "Items with no recipe that this order also needs (gas, disposables, crockery). Changes save automatically."}
          </p>
        </div>
      </div>

      {!event ? (
        <p className="text-sm text-muted-foreground">
          Set an Event Type on this order and save it. Its event is created for you, and you can list the inventory it needs here.
        </p>
      ) : inventoryItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">No inventory items yet.</p>
      ) : (
        <>
          <SearchableSelect
            aria-label="Add an extra item"
            options={available}
            value=""
            onValueChange={add}
            placeholder="Search inventory items to add…"
            searchPlaceholder="Type an item name…"
            emptyLabel="No matching inventory item."
          />
          {rows.length > 0 && (
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
              {rows.map((row) => {
                const item = inventoryItems.find((i) => i.id === row.inventoryId);
                if (!item) return null;
                return (
                  <div key={row.inventoryId} className="flex items-center gap-3 rounded-lg border border-border p-3" data-testid="extra-item-row">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        aria-label={`Quantity of ${item.name}`}
                        className="w-24"
                        value={row.quantity}
                        onChange={(e) => setRows((prev) => prev.map((r) => (r.inventoryId === row.inventoryId ? { ...r, quantity: e.target.value } : r)))}
                        onBlur={() => void save(rows)}
                      />
                      <span className="w-10 text-xs text-muted-foreground">{item.unit}</span>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.name}`} onClick={() => remove(row.inventoryId)}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </Card>
  );
}
