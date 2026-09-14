"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "../actions";

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

interface RequiredInventoryRow {
  inventoryId: string;
  checked: boolean;
  quantity: string;
}

export interface EventFormValues {
  customerId: string;
  eventTypeId: string;
  assignedKitchenId: string;
  name: string;
  startDate: string;
  endDate: string;
  venue: string;
  guestCount: string;
  notes: string;
  status: string;
  requiredInventory: RequiredInventoryRow[];
}

export function emptyRequiredInventory(items: { id: string }[]): RequiredInventoryRow[] {
  return items.map((i) => ({ inventoryId: i.id, checked: false, quantity: "" }));
}

export const EMPTY_EVENT_VALUES: Omit<EventFormValues, "requiredInventory"> = {
  customerId: "",
  eventTypeId: "",
  assignedKitchenId: "",
  name: "",
  startDate: "",
  endDate: "",
  venue: "",
  guestCount: "",
  notes: "",
  status: "PENDING",
};

interface EventFormProps {
  initialValues?: Partial<EventFormValues>;
  customers: { id: string; name: string; phone: string }[];
  eventTypes: { id: string; name: string }[];
  kitchens: { id: string; name: string; isDefault: boolean }[];
  inventoryItems: { id: string; name: string; unit: string }[];
  showStatus?: boolean;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function EventForm({
  initialValues,
  customers,
  eventTypes,
  kitchens,
  inventoryItems,
  showStatus,
  onSubmit,
  onSuccess,
  submitLabel,
}: EventFormProps) {
  const [values, setValues] = useState<EventFormValues>({
    ...EMPTY_EVENT_VALUES,
    assignedKitchenId: kitchens.find((k) => k.isDefault)?.id ?? "",
    requiredInventory: emptyRequiredInventory(inventoryItems),
    ...initialValues,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function updateInventoryRow(inventoryId: string, patch: Partial<RequiredInventoryRow>) {
    setField(
      "requiredInventory",
      values.requiredInventory.map((row) => (row.inventoryId === inventoryId ? { ...row, ...patch } : row)),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (values.customerId === "") {
      setError("A Customer is required.");
      return;
    }
    if (values.eventTypeId === "") {
      setError("An Event Type is required.");
      return;
    }
    setPending(true);

    const formData = new FormData();
    formData.set("customerId", values.customerId);
    formData.set("eventTypeId", values.eventTypeId);
    formData.set("assignedKitchenId", values.assignedKitchenId);
    formData.set("name", values.name);
    formData.set("startDate", values.startDate);
    formData.set("endDate", values.endDate);
    formData.set("venue", values.venue);
    formData.set("guestCount", values.guestCount);
    formData.set("notes", values.notes);
    if (showStatus) formData.set("status", values.status);
    for (const row of values.requiredInventory.filter((r) => r.checked)) {
      formData.append("requiredInventoryId", row.inventoryId);
      formData.append("requiredInventoryQuantity", row.quantity || "0");
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
    <form onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-form-name">Event Name</Label>
          <Input id="event-form-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-form-customer">Customer</Label>
          <Select value={values.customerId} onValueChange={(v) => setField("customerId", v ?? values.customerId)}>
            <SelectTrigger id="event-form-customer">
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
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="event-form-type">Event Type</Label>
            <Link href="/events/types/new" target="_blank" className="flex items-center gap-0.5 text-xs text-primary hover:underline">
              <Plus className="size-3" />
              Add New Event Type
            </Link>
          </div>
          <Select value={values.eventTypeId} onValueChange={(v) => setField("eventTypeId", v ?? values.eventTypeId)}>
            <SelectTrigger id="event-form-type">
              <SelectValue placeholder="Select an event type" />
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
          <Label htmlFor="event-form-kitchen">Kitchen</Label>
          <Select value={values.assignedKitchenId} onValueChange={(v) => setField("assignedKitchenId", v ?? values.assignedKitchenId)}>
            <SelectTrigger id="event-form-kitchen">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              {kitchens.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-form-start">Start Date</Label>
          <Input id="event-form-start" type="date" required value={values.startDate} onChange={(e) => setField("startDate", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-form-end">End Date</Label>
          <Input id="event-form-end" type="date" required value={values.endDate} onChange={(e) => setField("endDate", e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-form-venue">Venue</Label>
          <Input id="event-form-venue" value={values.venue} onChange={(e) => setField("venue", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-form-guests">Guest Count</Label>
          <Input
            id="event-form-guests"
            type="number"
            min="0"
            value={values.guestCount}
            onChange={(e) => setField("guestCount", e.target.value)}
          />
        </div>

        {showStatus && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-form-status">Status</Label>
            <Select value={values.status} onValueChange={(v) => setField("status", v ?? values.status)}>
              <SelectTrigger id="event-form-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="col-span-full flex flex-col gap-1.5">
          <Label htmlFor="event-form-notes">Notes</Label>
          <Textarea id="event-form-notes" value={values.notes} onChange={(e) => setField("notes", e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Label>Required Inventory</Label>
        <p className="text-xs text-muted-foreground">Which inventory items (and how much of each) this event needs.</p>
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-md border border-border p-3">
          {values.requiredInventory.map((row) => {
            const item = inventoryItems.find((i) => i.id === row.inventoryId);
            if (!item) return null;
            return (
              <div key={row.inventoryId} className="flex flex-wrap items-center gap-2 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                <label htmlFor={`event-inv-${row.inventoryId}`} className="flex min-w-40 flex-1 cursor-pointer items-center gap-2">
                  <Checkbox
                    id={`event-inv-${row.inventoryId}`}
                    checked={row.checked}
                    onCheckedChange={(checked) => updateInventoryRow(row.inventoryId, { checked: checked === true })}
                  />
                  <span className="text-sm">
                    {item.name} <span className="text-muted-foreground">({item.unit})</span>
                  </span>
                </label>
                {row.checked && (
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Quantity"
                    className="w-32"
                    value={row.quantity}
                    onChange={(e) => updateInventoryRow(row.inventoryId, { quantity: e.target.value })}
                  />
                )}
              </div>
            );
          })}
          {inventoryItems.length === 0 && <p className="text-sm text-muted-foreground">No inventory items yet.</p>}
        </div>
      </div>

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
