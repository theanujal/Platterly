"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormDrawer } from "@/components/catalog/form-drawer";
import { formatRupees } from "@/components/catalog/catalog-display";
import { Input } from "@/components/ui/input";
import { confirmBatchCostAction, listBatchesAction, setBatchStatusAction, type BatchRow, type BatchesResult } from "../actions";

const SOURCE_LABEL = { OPENING: "Opening stock", RECEIPT: "Delivery", STOCK_IN: "Stock in", ADJUSTMENT: "Adjustment" } as const;

const fmt = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

function StateBadge({ batch }: { batch: BatchRow }) {
  if (batch.state === "expired") return <Badge variant="danger">Expired</Badge>;
  if (batch.state === "quarantined") return <Badge variant="warning">Quarantined</Badge>;
  if (batch.state === "empty") return <Badge variant="neutral">Used up</Badge>;
  if (batch.expiringSoon) return <Badge variant="warning">Expires soon</Badge>;
  return <Badge variant="success">Usable</Badge>;
}

/**
 * The batches an item's stock is made of (AJ, 2026-10-15): oldest first, which is the order stock is used and costed (FIFO).
 * The kitchen is advised to use the batch that expires soonest (FEFO) when that differs. Expired and quarantined batches are
 * never used automatically; a batch can be held back and released here.
 */
export function BatchesDrawer({
  open,
  onOpenChange,
  itemId,
  name,
  unit,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  name: string;
  unit: string;
  canEdit: boolean;
}) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={`Batches — ${name}`}
      description="Stock is used oldest batch first, and costed that way. Expired and quarantined batches are never used automatically."
    >
      <BatchesBody itemId={itemId} unit={unit} canEdit={canEdit} />
    </FormDrawer>
  );
}

// Inside the drawer, so it loads fresh every time the drawer opens.
function BatchesBody({ itemId, unit, canEdit }: { itemId: string; unit: string; canEdit: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<BatchesResult | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The batch whose unknown cost is being confirmed, with what was typed.
  const [confirming, setConfirming] = useState<{ id: string; cost: string; note: string } | null>(null);

  useEffect(() => {
    let current = true;
    void listBatchesAction(itemId).then((result) => current && setData(result));
    return () => {
      current = false;
    };
  }, [itemId, reload]);

  async function toggle(batch: BatchRow) {
    setBusy(batch.id);
    setError(null);
    const result = await setBatchStatusAction(itemId, batch.id, batch.state === "quarantined" ? "ACTIVE" : "QUARANTINED");
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setReload((n) => n + 1);
    router.refresh();
  }

  async function confirmCost() {
    if (!confirming) return;
    setError(null);
    const cost = Number.parseFloat(confirming.cost);
    if (confirming.cost.trim() === "" || Number.isNaN(cost)) return setError("Enter the unit cost.");
    if (cost < 0) return setError("The unit cost cannot be negative.");
    if (cost === 0 && confirming.note.trim().length < 3) return setError("A cost of 0 means free goods. Say why.");
    setBusy(confirming.id);
    const result = await confirmBatchCostAction(itemId, confirming.id, cost, confirming.note);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setConfirming(null);
    setReload((n) => n + 1);
    router.refresh();
  }

  const shown = data && data.ok ? data.batches.filter((b) => b.state !== "empty") : [];
  const recommended = data && data.ok ? data.batches.find((b) => b.id === data.recommendedBatchId) : undefined;
  const fifoFirst = shown.find((b) => b.fifoRank === 1);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
      {!data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {data.error}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["On hand", data.position.stockCount],
              ["Usable", data.position.usable],
              ["Expired", data.position.expired],
              ["Quarantined", data.position.quarantined],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">
                  {Math.round((value as number) * 1000) / 1000} <span className="text-sm font-normal text-muted-foreground">{unit}</span>
                </p>
              </div>
            ))}
          </div>
          {data.position.unbatched > 0 && (
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              {data.position.unbatched} {unit} of this stock is not in any batch (its cost and expiry are not known). It is used first.
            </p>
          )}
          {recommended && fifoFirst && recommended.id !== fifoFirst.id && (
            <p data-testid="fefo-advice" className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              In the kitchen, use the batch expiring {fmt(recommended.expiryDate)} first. Costing still follows the oldest batch.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No stock in any batch.</p>
          ) : (
            <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-3 py-3">Use order</th>
                    <th className="px-3 py-3">Received</th>
                    <th className="px-3 py-3">Lot</th>
                    <th className="px-3 py-3">Expiry</th>
                    <th className="px-3 py-3">Unit cost</th>
                    <th className="px-3 py-3">Left</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((b) => (
                    <tr key={b.id} data-testid="batch-row" className="border-t border-border">
                      <td className="px-3 py-3 font-semibold">{b.fifoRank ?? "—"}</td>
                      <td className="px-3 py-3">
                        {fmt(b.receivedDate)}
                        <span className="block text-xs text-muted-foreground">{SOURCE_LABEL[b.source]}</span>
                      </td>
                      <td className="px-3 py-3">{b.lotNumber ?? "—"}</td>
                      <td className="px-3 py-3">{b.expiryMissing ? <Badge variant="warning">Not recorded</Badge> : fmt(b.expiryDate)}</td>
                      <td className="px-3 py-3">
                        {b.unitCost !== null ? (
                          <>
                            {formatRupees(b.unitCost)}
                            {b.unitCost === 0 && <span className="block text-xs text-muted-foreground">Free{b.costNote ? `: ${b.costNote}` : ""}</span>}
                          </>
                        ) : confirming?.id === b.id ? (
                          <div className="flex flex-col gap-1.5">
                            <Input
                              aria-label="Unit cost"
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-28"
                              value={confirming.cost}
                              onChange={(e) => setConfirming({ ...confirming, cost: e.target.value })}
                            />
                            {confirming.cost.trim() !== "" && Number.parseFloat(confirming.cost) === 0 && (
                              <Input
                                aria-label="Why is it free?"
                                placeholder="Why is it free?"
                                maxLength={300}
                                value={confirming.note}
                                onChange={(e) => setConfirming({ ...confirming, note: e.target.value })}
                              />
                            )}
                            <div className="flex gap-1.5">
                              <Button type="button" size="md" disabled={busy === b.id} onClick={() => void confirmCost()}>
                                Save cost
                              </Button>
                              <Button type="button" size="md" variant="outline" onClick={() => setConfirming(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <span className="flex flex-col items-start gap-1">
                            <span className="text-muted-foreground">Not known</span>
                            {canEdit && b.state !== "empty" && (
                              <Button
                                type="button"
                                variant="outline"
                                size="md"
                                onClick={() => setConfirming({ id: b.id, cost: "", note: "" })}
                                aria-label={`Confirm cost of batch ${b.lotNumber ?? b.id.slice(-4)}`}
                              >
                                Confirm cost
                              </Button>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {b.remainingQuantity}{" "}
                        <span className="text-muted-foreground">
                          of {b.originalQuantity} {unit}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <StateBadge batch={b} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        {canEdit && b.state !== "expired" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="md"
                            disabled={busy === b.id}
                            onClick={() => void toggle(b)}
                            aria-label={`${b.state === "quarantined" ? "Release" : "Quarantine"} batch ${b.lotNumber ?? b.id.slice(-4)}`}
                          >
                            {b.state === "quarantined" ? "Release" : "Quarantine"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
