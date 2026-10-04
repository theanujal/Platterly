"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRupees } from "@/components/catalog/catalog-display";
import { orderedValue } from "@/modules/purchasing/po-math";
import { createPurchaseOrderAction, updatePurchaseOrderAction } from "../actions";

export interface ItemOption {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number | null;
}

export interface PurchaseOrderFormValues {
  supplierId: string;
  expectedDate: string;
  notes: string;
  items: { inventoryId: string; quantity: string; unitCost: string }[];
}

/** Create a purchase request, or edit a draft. Lines are Inventory items; the unit cost starts from the item's own cost. */
export function PurchaseOrderForm({
  poId,
  suppliers,
  options,
  initialValues,
}: {
  poId?: string;
  suppliers: { id: string; name: string }[];
  options: ItemOption[];
  initialValues: PurchaseOrderFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const byId = new Map(options.map((o) => [o.id, o]));

  const setRow = (index: number, patch: Partial<PurchaseOrderFormValues["items"][number]>) =>
    setValues((v) => ({ ...v, items: v.items.map((row, i) => (i === index ? { ...row, ...patch } : row)) }));

  const total = orderedValue(values.items.map((r) => ({ quantity: Number.parseFloat(r.quantity) || 0, receivedQuantity: 0, unitCost: Number.parseFloat(r.unitCost) || 0 })));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const payload = {
      supplierId: values.supplierId,
      expectedDate: values.expectedDate,
      notes: values.notes,
      items: values.items.filter((r) => r.inventoryId).map((r) => ({ inventoryId: r.inventoryId, quantity: Number.parseFloat(r.quantity), unitCost: Number.parseFloat(r.unitCost) || 0 })),
    };
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
            <Select items={Object.fromEntries(suppliers.map((s) => [s.id, s.name]))} value={values.supplierId} onValueChange={(v) => setValues((x) => ({ ...x, supplierId: v ?? "" }))}>
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="po-expected">Expected on</Label>
            <Input id="po-expected" type="date" value={values.expectedDate} onChange={(e) => setValues((x) => ({ ...x, expectedDate: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="po-notes">Notes</Label>
            <Textarea id="po-notes" value={values.notes} onChange={(e) => setValues((x) => ({ ...x, notes: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {values.items.map((row, index) => {
            const option = byId.get(row.inventoryId);
            return (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <div className="min-w-48 flex-1">
                  <Select
                    items={Object.fromEntries(options.map((o) => [o.id, o.name]))}
                    value={row.inventoryId}
                    onValueChange={(v) => {
                      const next = byId.get(v ?? "");
                      setRow(index, { inventoryId: v ?? "", unitCost: row.unitCost || (next?.costPerUnit != null ? String(next.costPerUnit) : "") });
                    }}
                  >
                    <SelectTrigger aria-label={`Item ${index + 1}`} className="w-full">
                      <SelectValue placeholder="Choose an inventory item" />
                    </SelectTrigger>
                    <SelectContent>
                      {options
                        .filter((o) => o.id === row.inventoryId || !values.items.some((r) => r.inventoryId === o.id))
                        .map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input className="w-32" aria-label={`Quantity ${index + 1}`} type="number" min="0" step="0.001" placeholder={option ? `Qty (${option.unit})` : "Qty"} value={row.quantity} onChange={(e) => setRow(index, { quantity: e.target.value })} />
                <Input className="w-32" aria-label={`Unit cost ${index + 1}`} type="number" min="0" step="0.01" placeholder="₹ / unit" value={row.unitCost} onChange={(e) => setRow(index, { unitCost: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove row ${index + 1}`} onClick={() => setValues((v) => ({ ...v, items: v.items.length > 1 ? v.items.filter((_, i) => i !== index) : [{ inventoryId: "", quantity: "", unitCost: "" }] }))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
          <Button type="button" variant="outline" className="self-start" onClick={() => setValues((v) => ({ ...v, items: [...v.items, { inventoryId: "", quantity: "", unitCost: "" }] }))}>
            <Plus /> Add item
          </Button>
          <p className="text-sm text-muted-foreground">
            Order total: <span className="font-semibold text-foreground">{formatRupees(total)}</span>
          </p>
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
