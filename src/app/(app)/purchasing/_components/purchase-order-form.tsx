"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPurchaseOrderAction, updatePurchaseOrderAction } from "../actions";

export interface ItemOption {
  id: string;
  name: string;
  unit: string;
}

export interface PurchaseOrderFormValues {
  supplierId: string;
  notes: string;
  items: { inventoryId: string; quantity: string }[];
}

const EMPTY_ROW = { inventoryId: "", quantity: "" };

/**
 * Create a purchase request, or edit a draft. Lines are Inventory items the chosen supplier provides (Products Supplied),
 * with a quantity in the item's own unit. There are no prices here: the actual cost is captured when stock is received.
 */
export function PurchaseOrderForm({
  poId,
  suppliers,
  options,
  supplierProducts,
  initialValues,
}: {
  poId?: string;
  suppliers: { id: string; name: string }[];
  options: ItemOption[];
  /** supplierId -> the inventory items that supplier provides. */
  supplierProducts: Record<string, string[]>;
  initialValues: PurchaseOrderFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const byId = new Map(options.map((o) => [o.id, o]));

  // What a supplier can be ordered: its mapped items, plus (when editing) the lines the draft already had for that supplier.
  const allowedFor = (supplierId: string) => {
    const allowed = new Set(supplierProducts[supplierId] ?? []);
    if (poId && supplierId === initialValues.supplierId) for (const row of initialValues.items) allowed.add(row.inventoryId);
    return allowed;
  };
  const allowed = allowedFor(values.supplierId);
  const choices = options.filter((o) => allowed.has(o.id));

  const setRow = (index: number, patch: Partial<PurchaseOrderFormValues["items"][number]>) => setValues((v) => ({ ...v, items: v.items.map((row, i) => (i === index ? { ...row, ...patch } : row)) }));

  function chooseSupplier(supplierId: string) {
    const nextAllowed = allowedFor(supplierId);
    const kept = values.items.filter((r) => !r.inventoryId || nextAllowed.has(r.inventoryId));
    const dropped = values.items.filter((r) => r.inventoryId).length - kept.filter((r) => r.inventoryId).length;
    setNotice(dropped > 0 ? `${dropped} item${dropped === 1 ? "" : "s"} removed because this supplier does not provide ${dropped === 1 ? "it" : "them"}.` : null);
    setValues((v) => ({ ...v, supplierId, items: kept.length > 0 ? kept : [EMPTY_ROW] }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!values.supplierId) return setError("Choose a supplier.");
    const lines = values.items.filter((r) => r.inventoryId);
    if (lines.length === 0) return setError("Add at least one item.");
    if (lines.some((r) => !(Number.parseFloat(r.quantity) > 0))) return setError("Every item needs a quantity greater than zero.");
    setPending(true);
    const payload = { supplierId: values.supplierId, notes: values.notes, items: lines.map((r) => ({ inventoryId: r.inventoryId, quantity: Number.parseFloat(r.quantity) })) };
    const result = poId ? await updatePurchaseOrderAction(poId, payload).then((r) => (r.ok ? { ok: true as const, id: poId } : r)) : await createPurchaseOrderAction(payload);
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.push(`/purchasing/${result.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Order details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="po-supplier">Supplier</Label>
            <Select items={Object.fromEntries(suppliers.map((s) => [s.id, s.name]))} value={values.supplierId} onValueChange={(v) => chooseSupplier(v ?? "")}>
              <SelectTrigger id="po-supplier" className="w-full">
                <SelectValue placeholder="Choose a supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!values.supplierId ? (
            <p className="text-sm text-muted-foreground">Choose a supplier to see the items they provide.</p>
          ) : choices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This supplier has no products yet. Add them under Products Supplied in the{" "}
              <Link href="/suppliers" className="font-medium text-primary hover:underline">
                supplier
              </Link>
              .
            </p>
          ) : (
            <>
              {values.items.map((row, index) => {
                const option = byId.get(row.inventoryId);
                return (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <div className="min-w-48 flex-1">
                      <Select items={Object.fromEntries(choices.map((o) => [o.id, o.name]))} value={row.inventoryId} onValueChange={(v) => setRow(index, { inventoryId: v ?? "" })}>
                        <SelectTrigger aria-label={`Item ${index + 1}`} className="w-full">
                          <SelectValue placeholder="Choose an inventory item" />
                        </SelectTrigger>
                        <SelectContent>
                          {choices
                            .filter((o) => o.id === row.inventoryId || !values.items.some((r) => r.inventoryId === o.id))
                            .map((o) => (
                              <SelectItem key={o.id} value={o.id}>
                                {o.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input className="w-32" aria-label={`Quantity ${index + 1}`} type="number" min="0" step="0.001" placeholder="Qty" value={row.quantity} onChange={(e) => setRow(index, { quantity: e.target.value })} />
                    <span className="w-16 text-sm text-muted-foreground" aria-label={`Unit ${index + 1}`}>
                      {option?.unit ?? ""}
                    </span>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove row ${index + 1}`} onClick={() => setValues((v) => ({ ...v, items: v.items.length > 1 ? v.items.filter((_, i) => i !== index) : [EMPTY_ROW] }))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
              <Button type="button" variant="outline" className="self-start" onClick={() => setValues((v) => ({ ...v, items: [...v.items, EMPTY_ROW] }))}>
                <Plus /> Add item
              </Button>
            </>
          )}
          {notice && (
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          <Label htmlFor="po-notes">Notes (optional)</Label>
          <Textarea id="po-notes" value={values.notes} onChange={(e) => setValues((x) => ({ ...x, notes: e.target.value }))} />
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : poId ? "Save changes" : "Save as draft"}
        </Button>
      </div>
    </form>
  );
}
