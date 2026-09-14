"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "../actions";

const MEAL_TYPES = [
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "LUNCH", label: "Lunch" },
  { value: "HITEA", label: "Hi-Tea" },
  { value: "DINNER", label: "Dinner" },
  { value: "OTHER", label: "Other" },
] as const;

const ORDER_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "IN_PREPARATION", label: "In Preparation" },
  { value: "READY", label: "Ready" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

const PAYMENT_STATUS_OPTIONS = [
  { value: "UNPAID", label: "Unpaid" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "PAID", label: "Paid" },
] as const;

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

interface MealSelection {
  date: string;
  mealType: (typeof MEAL_TYPES)[number]["value"];
  price: string;
}

export interface OrderFormValues {
  customerId: string;
  eventTypeId: string;
  eventStartDate: string;
  eventEndDate: string;
  venue: string;
  eventAddress: string;
  adultCount: string;
  childCount: string;
  totalParticipants: string;
  adultNonVegCount: string;
  adultVegCount: string;
  individualPricingEnabled: boolean;
  discount: string;
  taxes: string;
  advance: string;
  paymentStatus: string;
  status: string;
  notes: string;
  items: LineItemRow[];
  mealPlanEntries: MealSelection[];
}

export const EMPTY_ORDER_VALUES: OrderFormValues = {
  customerId: "",
  eventTypeId: "",
  eventStartDate: "",
  eventEndDate: "",
  venue: "",
  eventAddress: "",
  adultCount: "",
  childCount: "",
  totalParticipants: "",
  adultNonVegCount: "",
  adultVegCount: "",
  individualPricingEnabled: false,
  discount: "0",
  taxes: "0",
  advance: "0",
  paymentStatus: "UNPAID",
  status: "DRAFT",
  notes: "",
  items: [],
  mealPlanEntries: [],
};

function enumerateDates(start: string, end: string): string[] {
  if (!start || !end) return [];
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return [];
  const dates: string[] = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

interface OrderFormProps {
  initialValues?: Partial<OrderFormValues>;
  customers: { id: string; name: string; phone: string }[];
  eventTypes: { id: string; name: string }[];
  menus: CatalogOption[];
  menuItems: CatalogOption[];
  addOns: CatalogOption[];
  showStatus?: boolean;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
  /** Group 10.5's "Create & Send WhatsApp" action, alongside the plain submit. */
  onSubmitAndNotify?: (formData: FormData) => Promise<ActionResult>;
}

export function OrderForm({
  initialValues,
  customers,
  eventTypes,
  menus,
  menuItems,
  addOns,
  showStatus,
  onSubmit,
  onSuccess,
  submitLabel,
  onSubmitAndNotify,
}: OrderFormProps) {
  const [values, setValues] = useState<OrderFormValues>({ ...EMPTY_ORDER_VALUES, ...initialValues });
  const [pendingItemType, setPendingItemType] = useState<(typeof ITEM_TYPE_OPTIONS)[number]["value"]>("MENU_ITEM");
  const [pendingCatalogId, setPendingCatalogId] = useState("");
  const [pendingQuantity, setPendingQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "whatsapp" | null>(null);

  function setField<K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const catalogByType: Record<(typeof ITEM_TYPE_OPTIONS)[number]["value"], CatalogOption[]> = {
    MENU: menus,
    MENU_ITEM: menuItems,
    ADD_ON: addOns,
  };

  const days = useMemo(() => enumerateDates(values.eventStartDate, values.eventEndDate), [values.eventStartDate, values.eventEndDate]);

  const mealMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of values.mealPlanEntries) map.set(`${entry.date}|${entry.mealType}`, entry.price);
    return map;
  }, [values.mealPlanEntries]);

  function toggleMeal(date: string, mealType: (typeof MEAL_TYPES)[number]["value"], checked: boolean) {
    setField(
      "mealPlanEntries",
      checked
        ? [...values.mealPlanEntries, { date, mealType, price: "" }]
        : values.mealPlanEntries.filter((e) => !(e.date === date && e.mealType === mealType)),
    );
  }

  function setMealPrice(date: string, mealType: (typeof MEAL_TYPES)[number]["value"], price: string) {
    setField(
      "mealPlanEntries",
      values.mealPlanEntries.map((e) => (e.date === date && e.mealType === mealType ? { ...e, price } : e)),
    );
  }

  function bulkSelect(mealType: (typeof MEAL_TYPES)[number]["value"]) {
    const withoutThisMeal = values.mealPlanEntries.filter((e) => e.mealType !== mealType);
    const additions = days.map((date) => ({ date, mealType, price: "" }));
    setField("mealPlanEntries", [...withoutThisMeal, ...additions]);
  }

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
  const mealsSubtotal = values.individualPricingEnabled
    ? values.mealPlanEntries.reduce((sum, e) => sum + (Number.parseFloat(e.price) || 0), 0)
    : 0;
  const subtotal = itemsSubtotal + mealsSubtotal;
  const discountNum = Number.parseFloat(values.discount) || 0;
  const taxesNum = Number.parseFloat(values.taxes) || 0;
  const advanceNum = Number.parseFloat(values.advance) || 0;
  const total = subtotal - discountNum + taxesNum;
  const balance = total - advanceNum;

  function buildFormData(): FormData {
    const formData = new FormData();
    formData.set("customerId", values.customerId);
    formData.set("eventTypeId", values.eventTypeId);
    formData.set("eventStartDate", values.eventStartDate);
    formData.set("eventEndDate", values.eventEndDate);
    formData.set("venue", values.venue);
    formData.set("eventAddress", values.eventAddress);
    formData.set("adultCount", values.adultCount);
    formData.set("childCount", values.childCount);
    formData.set("totalParticipants", values.totalParticipants || String((Number(values.adultCount) || 0) + (Number(values.childCount) || 0)));
    formData.set("adultNonVegCount", values.adultNonVegCount);
    formData.set("adultVegCount", values.adultVegCount);
    formData.set("individualPricingEnabled", String(values.individualPricingEnabled));
    formData.set("discount", values.discount);
    formData.set("taxes", values.taxes);
    formData.set("advance", values.advance);
    formData.set("paymentStatus", values.paymentStatus);
    if (showStatus) formData.set("status", values.status);
    formData.set("notes", values.notes);
    for (const item of values.items) {
      formData.append("itemType", item.itemType);
      formData.append("catalogId", item.catalogId);
      formData.append("quantity", String(item.quantity));
    }
    for (const entry of values.mealPlanEntries) {
      formData.append("mealDate", entry.date);
      formData.append("mealType", entry.mealType);
      formData.append("mealPrice", entry.price || "0");
    }
    return formData;
  }

  async function handleSubmit(notifyWhatsApp: boolean) {
    setError(null);
    if (!values.customerId) {
      setError("A Customer is required.");
      return;
    }
    if (!values.eventStartDate || !values.eventEndDate) {
      setError("Event start and end dates are required.");
      return;
    }
    setPending(notifyWhatsApp ? "whatsapp" : "save");

    const submitFn = notifyWhatsApp && onSubmitAndNotify ? onSubmitAndNotify : onSubmit;
    const result = await submitFn(buildFormData());
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit(false);
      }}
      className="flex max-w-4xl flex-col gap-8"
    >
      {/* 1. Customer Information */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Customer Information</h2>
        <div className="flex flex-col gap-1.5 sm:max-w-sm">
          <Label htmlFor="order-customer">Customer</Label>
          <Select value={values.customerId} onValueChange={(v) => setField("customerId", v ?? values.customerId)}>
            <SelectTrigger id="order-customer">
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
      </section>

      {/* 2. Event Information */}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Event Information</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-event-type">Event Type</Label>
            <Select value={values.eventTypeId} onValueChange={(v) => setField("eventTypeId", v ?? values.eventTypeId)}>
              <SelectTrigger id="order-event-type">
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
          <div />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-start-date">Event Start Date</Label>
            <Input id="order-start-date" type="date" required value={values.eventStartDate} onChange={(e) => setField("eventStartDate", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-end-date">Event End Date</Label>
            <Input id="order-end-date" type="date" required value={values.eventEndDate} onChange={(e) => setField("eventEndDate", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-venue">Location / Venue</Label>
            <Input id="order-venue" value={values.venue} onChange={(e) => setField("venue", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-address">Event Address</Label>
            <Input id="order-address" value={values.eventAddress} onChange={(e) => setField("eventAddress", e.target.value)} />
          </div>
        </div>
      </section>

      {/* 3. Participant Information */}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Participant Information</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-adults">Adults</Label>
            <Input id="order-adults" type="number" min="0" value={values.adultCount} onChange={(e) => setField("adultCount", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-children">Children</Label>
            <Input id="order-children" type="number" min="0" value={values.childCount} onChange={(e) => setField("childCount", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-total-participants">Total Participants</Label>
            <Input
              id="order-total-participants"
              type="number"
              min="0"
              placeholder={String((Number(values.adultCount) || 0) + (Number(values.childCount) || 0))}
              value={values.totalParticipants}
              onChange={(e) => setField("totalParticipants", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-adult-nonveg">Adult Non-Veg</Label>
            <Input id="order-adult-nonveg" type="number" min="0" value={values.adultNonVegCount} onChange={(e) => setField("adultNonVegCount", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-adult-veg">Adult Veg</Label>
            <Input id="order-adult-veg" type="number" min="0" value={values.adultVegCount} onChange={(e) => setField("adultVegCount", e.target.value)} />
          </div>
        </div>
      </section>

      {/* 4. Meal Planning */}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Meal Planning</h2>
          <label htmlFor="order-individual-pricing" className="flex cursor-pointer items-center gap-2">
            <Checkbox
              id="order-individual-pricing"
              checked={values.individualPricingEnabled}
              onCheckedChange={(checked) => setField("individualPricingEnabled", checked === true)}
            />
            <span className="text-sm font-medium">Individual pricing</span>
          </label>
        </div>
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">Set the Event start/end dates above to plan meals.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {(["BREAKFAST", "LUNCH", "DINNER"] as const).map((mealType) => (
                <Button key={mealType} type="button" variant="outline" size="sm" onClick={() => bulkSelect(mealType)}>
                  All {MEAL_TYPES.find((m) => m.value === mealType)!.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              {days.map((date) => {
                const selectedCount = MEAL_TYPES.filter((m) => mealMap.has(`${date}|${m.value}`)).length;
                return (
                  <div key={date} className="flex flex-col gap-2 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
                      <span className="text-xs text-muted-foreground">{selectedCount} meal{selectedCount === 1 ? "" : "s"} selected</span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {MEAL_TYPES.map((meal) => {
                        const key = `${date}|${meal.value}`;
                        const checked = mealMap.has(key);
                        return (
                          <div key={meal.value} className="flex items-center gap-1.5">
                            <label htmlFor={`meal-${date}-${meal.value}`} className="flex cursor-pointer items-center gap-1.5">
                              <Checkbox
                                id={`meal-${date}-${meal.value}`}
                                checked={checked}
                                onCheckedChange={(c) => toggleMeal(date, meal.value, c === true)}
                              />
                              <span className="text-sm">{meal.label}</span>
                            </label>
                            {checked && values.individualPricingEnabled && (
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Price"
                                className="w-24"
                                value={mealMap.get(key) ?? ""}
                                onChange={(e) => setMealPrice(date, meal.value, e.target.value)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 6. Products & Menu Items */}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Products & Menu Items</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-type">Type</Label>
            <Select value={pendingItemType} onValueChange={(v) => { setPendingItemType((v as typeof pendingItemType) ?? pendingItemType); setPendingCatalogId(""); }}>
              <SelectTrigger id="item-type" className="w-40">
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
            <Label htmlFor="item-catalog">Item</Label>
            <Select value={pendingCatalogId} onValueChange={(v) => setPendingCatalogId(v ?? "")}>
              <SelectTrigger id="item-catalog" className="w-56">
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
            <Label htmlFor="item-quantity">Qty</Label>
            <Input id="item-quantity" type="number" min="1" className="w-20" value={pendingQuantity} onChange={(e) => setPendingQuantity(e.target.value)} />
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

      {/* 7. Additional Details */}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Additional Details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {showStatus && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="order-status">Status</Label>
              <Select value={values.status} onValueChange={(v) => setField("status", v ?? values.status)}>
                <SelectTrigger id="order-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-payment-status">Payment Status</Label>
            <Select value={values.paymentStatus} onValueChange={(v) => setField("paymentStatus", v ?? values.paymentStatus)}>
              <SelectTrigger id="order-payment-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-discount">Discount</Label>
            <Input id="order-discount" type="number" min="0" step="0.01" value={values.discount} onChange={(e) => setField("discount", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-taxes">Taxes</Label>
            <Input id="order-taxes" type="number" min="0" step="0.01" value={values.taxes} onChange={(e) => setField("taxes", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-advance">Advance Received</Label>
            <Input id="order-advance" type="number" min="0" step="0.01" value={values.advance} onChange={(e) => setField("advance", e.target.value)} />
          </div>
          <div className="col-span-full flex flex-col gap-1.5">
            <Label htmlFor="order-notes">Notes</Label>
            <Textarea id="order-notes" value={values.notes} onChange={(e) => setField("notes", e.target.value)} />
          </div>
        </div>
      </section>

      {/* Pricing summary — live preview, mirrors recalculateOrderTotals server-side */}
      <section className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-4 text-sm sm:max-w-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{formatCurrency(discountNum)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Taxes</span><span>+{formatCurrency(taxesNum)}</span></div>
        <div className="flex justify-between border-t border-border pt-1.5 font-semibold"><span>Total</span><span>{formatCurrency(total)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Advance</span><span>-{formatCurrency(advanceNum)}</span></div>
        <div className="flex justify-between font-semibold"><span>Balance</span><span>{formatCurrency(balance)}</span></div>
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending !== null}>
          {pending === "save" ? "Saving…" : submitLabel}
        </Button>
        {onSubmitAndNotify && (
          <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void handleSubmit(true)}>
            {pending === "whatsapp" ? "Sending…" : "Create & Send WhatsApp"}
          </Button>
        )}
      </div>
    </form>
  );
}
