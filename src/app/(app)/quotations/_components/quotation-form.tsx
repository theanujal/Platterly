"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "../actions";

const ITEM_TYPE_OPTIONS = [
  { value: "MENU", label: "Menu Type" },
  { value: "MENU_ITEM", label: "Food Item" },
  { value: "ADD_ON", label: "Add-on" },
] as const;

interface CatalogOption {
  id: string;
  name: string;
  price: number;
}

interface LineItemRow {
  key: string;
  itemType: (typeof ITEM_TYPE_OPTIONS)[number]["value"];
  catalogId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export interface QuotationFormValues {
  customerId: string;
  eventTypeId: string;
  eventStartDate: string;
  eventEndDate: string;
  venue: string;
  eventAddress: string;
  validUntil: string;
  terms: string;
  notes: string;
  discount: string;
  taxes: string;
  additionalCharges: string;
  deliveryCharges: string;
  items: LineItemRow[];
}

export const EMPTY_QUOTATION_VALUES: QuotationFormValues = {
  customerId: "",
  eventTypeId: "",
  eventStartDate: "",
  eventEndDate: "",
  venue: "",
  eventAddress: "",
  validUntil: "",
  terms: "",
  notes: "",
  discount: "0",
  taxes: "0",
  additionalCharges: "0",
  deliveryCharges: "0",
  items: [],
};

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

interface QuotationFormProps {
  initialValues?: Partial<QuotationFormValues>;
  customers: { id: string; name: string; phone: string }[];
  eventTypes: { id: string; name: string }[];
  menus: CatalogOption[];
  menuItems: CatalogOption[];
  addOns: CatalogOption[];
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function QuotationForm({ initialValues, customers, eventTypes, menus, menuItems, addOns, onSubmit, onSuccess, submitLabel }: QuotationFormProps) {
  const [values, setValues] = useState<QuotationFormValues>({ ...EMPTY_QUOTATION_VALUES, ...initialValues });
  const [pendingItemType, setPendingItemType] = useState<(typeof ITEM_TYPE_OPTIONS)[number]["value"]>("MENU_ITEM");
  const [pendingCatalogId, setPendingCatalogId] = useState("");
  const [pendingQuantity, setPendingQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof QuotationFormValues>(key: K, value: QuotationFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const catalogByType: Record<(typeof ITEM_TYPE_OPTIONS)[number]["value"], CatalogOption[]> = {
    MENU: menus,
    MENU_ITEM: menuItems,
    ADD_ON: addOns,
  };

  function addLineItem() {
    if (!pendingCatalogId) return;
    const option = catalogByType[pendingItemType].find((o) => o.id === pendingCatalogId);
    if (!option) return;
    const quantity = Number.parseInt(pendingQuantity, 10) || 1;
    setField("items", [
      ...values.items,
      { key: crypto.randomUUID(), itemType: pendingItemType, catalogId: option.id, name: option.name, unitPrice: option.price, quantity },
    ]);
    setPendingCatalogId("");
    setPendingQuantity("1");
  }

  function removeLineItem(key: string) {
    setField("items", values.items.filter((i) => i.key !== key));
  }

  const itemsSubtotal = values.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discountNum = Number.parseFloat(values.discount) || 0;
  const taxesNum = Number.parseFloat(values.taxes) || 0;
  const additionalNum = Number.parseFloat(values.additionalCharges) || 0;
  const deliveryNum = Number.parseFloat(values.deliveryCharges) || 0;
  const total = itemsSubtotal - discountNum + taxesNum + additionalNum + deliveryNum;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!values.customerId) {
      setError("A Customer is required.");
      return;
    }
    setPending(true);

    const formData = new FormData();
    formData.set("customerId", values.customerId);
    formData.set("eventTypeId", values.eventTypeId);
    formData.set("eventStartDate", values.eventStartDate);
    formData.set("eventEndDate", values.eventEndDate);
    formData.set("venue", values.venue);
    formData.set("eventAddress", values.eventAddress);
    formData.set("validUntil", values.validUntil);
    formData.set("terms", values.terms);
    formData.set("notes", values.notes);
    formData.set("discount", values.discount);
    formData.set("taxes", values.taxes);
    formData.set("additionalCharges", values.additionalCharges);
    formData.set("deliveryCharges", values.deliveryCharges);
    for (const item of values.items) {
      formData.append("itemType", item.itemType);
      formData.append("catalogId", item.catalogId);
      formData.append("quantity", String(item.quantity));
    }

    const result = await onSubmit(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Customer & Event</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-customer">Customer</Label>
            <Select
              items={Object.fromEntries(customers.map((c) => [c.id, `${c.name} (${c.phone})`]))}
              value={values.customerId}
              onValueChange={(v) => setField("customerId", v ?? values.customerId)}
            >
              <SelectTrigger id="quote-customer">
                <SelectValue placeholder="Select a customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.phone})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {customers.length === 0 && (
              <Link href="/customers" className="text-xs text-primary hover:underline">
                No customers yet — add one first
              </Link>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-event-type">Event Type</Label>
            <Select
              items={Object.fromEntries(eventTypes.map((t) => [t.id, t.name]))}
              value={values.eventTypeId}
              onValueChange={(v) => setField("eventTypeId", v ?? values.eventTypeId)}
            >
              <SelectTrigger id="quote-event-type">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                {eventTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-start-date">Event Start Date</Label>
            <Input id="quote-start-date" type="date" value={values.eventStartDate} onChange={(e) => setField("eventStartDate", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-end-date">Event End Date</Label>
            <Input id="quote-end-date" type="date" value={values.eventEndDate} onChange={(e) => setField("eventEndDate", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-venue">Location / Venue</Label>
            <Input id="quote-venue" value={values.venue} onChange={(e) => setField("venue", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-address">Event Address</Label>
            <Input id="quote-address" value={values.eventAddress} onChange={(e) => setField("eventAddress", e.target.value)} />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Line Items</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-item-type">Type</Label>
            <Select
              items={Object.fromEntries(ITEM_TYPE_OPTIONS.map((o) => [o.value, o.label]))}
              value={pendingItemType}
              onValueChange={(v) => { setPendingItemType((v as typeof pendingItemType) ?? pendingItemType); setPendingCatalogId(""); }}
            >
              <SelectTrigger id="quote-item-type" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITEM_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-item-catalog">Item</Label>
            <Select
              items={Object.fromEntries(catalogByType[pendingItemType].map((o) => [o.id, `${o.name} — ${formatCurrency(o.price)}`]))}
              value={pendingCatalogId}
              onValueChange={(v) => setPendingCatalogId(v ?? "")}
            >
              <SelectTrigger id="quote-item-catalog" className="w-56">
                <SelectValue placeholder="Select an item" />
              </SelectTrigger>
              <SelectContent>
                {catalogByType[pendingItemType].map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name} — {formatCurrency(option.price)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-item-quantity">Qty</Label>
            <Input id="quote-item-quantity" type="number" min="1" className="w-20" value={pendingQuantity} onChange={(e) => setPendingQuantity(e.target.value)} />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addLineItem} disabled={!pendingCatalogId}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>

        {values.items.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-md border border-border p-3">
            {values.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-2 border-b border-border/50 py-1.5 last:border-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{ITEM_TYPE_OPTIONS.find((o) => o.value === item.itemType)!.label}</Badge>
                  <span className="text-sm">{item.name}</span>
                  <span className="text-xs text-muted-foreground">× {item.quantity}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${item.name}`} onClick={() => removeLineItem(item.key)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Charges, Terms & Validity</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-discount">Discount</Label>
            <Input id="quote-discount" type="number" min="0" step="0.01" value={values.discount} onChange={(e) => setField("discount", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-taxes">Taxes</Label>
            <Input id="quote-taxes" type="number" min="0" step="0.01" value={values.taxes} onChange={(e) => setField("taxes", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-additional">Additional Charges</Label>
            <Input id="quote-additional" type="number" min="0" step="0.01" value={values.additionalCharges} onChange={(e) => setField("additionalCharges", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-delivery">Delivery Charges</Label>
            <Input id="quote-delivery" type="number" min="0" step="0.01" value={values.deliveryCharges} onChange={(e) => setField("deliveryCharges", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-valid-until">Valid Until</Label>
            <Input id="quote-valid-until" type="date" value={values.validUntil} onChange={(e) => setField("validUntil", e.target.value)} />
          </div>
          <div className="col-span-full flex flex-col gap-1.5">
            <Label htmlFor="quote-terms">Terms</Label>
            <Textarea id="quote-terms" value={values.terms} onChange={(e) => setField("terms", e.target.value)} />
          </div>
          <div className="col-span-full flex flex-col gap-1.5">
            <Label htmlFor="quote-notes">Notes</Label>
            <Textarea id="quote-notes" value={values.notes} onChange={(e) => setField("notes", e.target.value)} />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-4 text-sm sm:max-w-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(itemsSubtotal)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{formatCurrency(discountNum)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Taxes</span><span>+{formatCurrency(taxesNum)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Additional + Delivery</span><span>+{formatCurrency(additionalNum + deliveryNum)}</span></div>
        <div className="flex justify-between border-t border-border pt-1.5 font-semibold"><span>Total</span><span>{formatCurrency(total)}</span></div>
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
