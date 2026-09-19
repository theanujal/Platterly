"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { createEventForOrderAction, updateOrderEventAction, deleteOrderEventAction } from "../../actions";

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

interface LinkedEvent {
  id: string;
  eventTypeId: string;
  assignedKitchenId: string | null;
  guestCount: number | null;
  venue: string | null;
  status: string;
  name: string;
  startDate: string;
  endDate: string;
  notes: string;
  requiredInventory: { inventoryId: string; quantity: number }[];
}

interface OrderEventSectionProps {
  orderId: string;
  events: LinkedEvent[];
  eventTypes: { id: string; name: string }[];
  kitchens: { id: string; name: string }[];
  inventoryItems: { id: string; name: string; unit: string }[];
}

function buildInventoryRows(
  inventoryItems: { id: string }[],
  existing: { inventoryId: string; quantity: number }[],
): RequiredInventoryRow[] {
  const existingMap = new Map(existing.map((e) => [e.inventoryId, e.quantity]));
  return inventoryItems.map((item) => ({
    inventoryId: item.id,
    checked: existingMap.has(item.id),
    quantity: existingMap.has(item.id) ? String(existingMap.get(item.id)) : "",
  }));
}

/**
 * The Order/Event judgment call (dev plans/index.md #14, Group 10.6): a
 * single-event Order should read as one screen to the caterer even though
 * Order and Event stay two separate underlying records. Pre-creation, this
 * IS Group 10.6's "Create an event for this order?" prompt, inline rather
 * than a popup; post-creation, it's a FULL inline editor for the Event
 * (folded in from the standalone `/events/[id]` page, removed 2026-09-16
 * once every Event started coming from an Order — see AJ's note in
 * `src/modules/orders/README.md`).
 */
export function OrderEventSection({ orderId, events, eventTypes, kitchens, inventoryItems }: OrderEventSectionProps) {
  const router = useRouter();
  const [showExplainer, setShowExplainer] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    const result = await createEventForOrderAction(orderId);
    setCreating(false);
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Event</h2>
        <button type="button" onClick={() => setShowExplainer((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          What does this mean?
        </button>
      </div>
      {showExplainer && (
        <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          <strong>Order</strong> is the commercial/customer transaction — pricing, participants, what was sold.{" "}
          <strong>Event</strong> is the operational execution record — which kitchen, guest count on the ground, day-of logistics. They stay
          separate records, but you can manage both from here.
        </p>
      )}

      {events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Create an event for this order?</p>
            {createError && (
              <p role="alert" className="text-sm text-destructive">
                {createError}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" size="md" disabled={creating} onClick={handleCreate}>
                {creating ? "Creating…" : "Yes, create event"}
              </Button>
              <Button type="button" size="md" variant="outline" disabled>
                I&apos;ll do it later
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((event) => (
            <InlineEventEditor key={event.id} orderId={orderId} event={event} eventTypes={eventTypes} kitchens={kitchens} inventoryItems={inventoryItems} />
          ))}
        </div>
      )}
    </section>
  );
}

function InlineEventEditor({
  orderId,
  event,
  eventTypes,
  kitchens,
  inventoryItems,
}: {
  orderId: string;
  event: LinkedEvent;
  eventTypes: { id: string; name: string }[];
  kitchens: { id: string; name: string }[];
  inventoryItems: { id: string; name: string; unit: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState(event.name);
  const [eventTypeId, setEventTypeId] = useState(event.eventTypeId);
  const [assignedKitchenId, setAssignedKitchenId] = useState(event.assignedKitchenId ?? "");
  const [startDate, setStartDate] = useState(event.startDate);
  const [endDate, setEndDate] = useState(event.endDate);
  const [guestCount, setGuestCount] = useState(event.guestCount?.toString() ?? "");
  const [venue, setVenue] = useState(event.venue ?? "");
  const [status, setStatus] = useState(event.status);
  const [notes, setNotes] = useState(event.notes);
  const [requiredInventory, setRequiredInventory] = useState<RequiredInventoryRow[]>(() =>
    buildInventoryRows(inventoryItems, event.requiredInventory),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function updateInventoryRow(inventoryId: string, patch: Partial<RequiredInventoryRow>) {
    setRequiredInventory((prev) => prev.map((row) => (row.inventoryId === inventoryId ? { ...row, ...patch } : row)));
  }

  async function handleSave() {
    setPending(true);
    setError(null);
    setSaved(false);
    const formData = new FormData();
    formData.set("name", name);
    formData.set("eventTypeId", eventTypeId);
    formData.set("assignedKitchenId", assignedKitchenId);
    formData.set("startDate", startDate);
    formData.set("endDate", endDate);
    formData.set("guestCount", guestCount);
    formData.set("venue", venue);
    formData.set("status", status);
    formData.set("notes", notes);
    for (const row of requiredInventory.filter((r) => r.checked)) {
      formData.append("requiredInventoryId", row.inventoryId);
      formData.append("requiredInventoryQuantity", row.quantity || "0");
    }
    const result = await updateOrderEventAction(event.id, formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function handleDelete() {
    setDeletePending(true);
    setDeleteError(null);
    const result = await deleteOrderEventAction(orderId, event.id);
    setDeletePending(false);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setDeleteOpen(false);
    router.refresh();
  }

  return (
    <Card data-testid="order-event-editor">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <CalendarRange className="size-4 text-muted-foreground" />
            Event details
          </span>
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" />}>Delete</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                <AlertDialogDescription>This unlinks it from the order and permanently removes its required-inventory list. The Order itself is unaffected.</AlertDialogDescription>
              </AlertDialogHeader>
              {deleteError && (
                <p role="alert" className="text-sm text-destructive">
                  {deleteError}
                </p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" disabled={deletePending} onClick={handleDelete}>
                  {deletePending ? "Deleting…" : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="inline-event-name">Event Name</Label>
            <Input id="inline-event-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inline-event-type">Event Type</Label>
            <Select
              items={Object.fromEntries(eventTypes.map((t) => [t.id, t.name]))}
              value={eventTypeId}
              onValueChange={(v) => setEventTypeId(v ?? eventTypeId)}
            >
              <SelectTrigger id="inline-event-type">
                <SelectValue />
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
            <Label htmlFor="inline-event-kitchen">Kitchen</Label>
            <Select
              items={Object.fromEntries(kitchens.map((k) => [k.id, k.name]))}
              value={assignedKitchenId}
              onValueChange={(v) => setAssignedKitchenId(v ?? assignedKitchenId)}
            >
              <SelectTrigger id="inline-event-kitchen">
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
            <Label htmlFor="inline-event-start">Start Date</Label>
            <Input id="inline-event-start" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inline-event-end">End Date</Label>
            <Input id="inline-event-end" type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inline-event-guests">Guest Count</Label>
            <Input id="inline-event-guests" type="number" min="0" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inline-event-venue">Venue</Label>
            <Input id="inline-event-venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inline-event-status">Status</Label>
            <Select
              items={Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]))}
              value={status}
              onValueChange={(v) => setStatus(v ?? status)}
            >
              <SelectTrigger id="inline-event-status">
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
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="inline-event-notes">Notes</Label>
            <Textarea id="inline-event-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <Label>Required Inventory</Label>
          <p className="text-xs text-muted-foreground">Which inventory items (and how much of each) this event needs.</p>
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-md border border-border p-3">
            {requiredInventory.map((row) => {
              const item = inventoryItems.find((i) => i.id === row.inventoryId);
              if (!item) return null;
              return (
                <div key={row.inventoryId} className="flex flex-wrap items-center gap-2 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                  <label htmlFor={`inline-event-inv-${row.inventoryId}`} className="flex min-w-40 flex-1 cursor-pointer items-center gap-2">
                    <Checkbox
                      id={`inline-event-inv-${row.inventoryId}`}
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
        <div className="flex items-center gap-2">
          <Button type="button" size="md" disabled={pending} onClick={handleSave}>
            {pending ? "Saving…" : "Save Event details"}
          </Button>
          {saved && <span className="text-xs text-emerald-600">Saved.</span>}
        </div>
      </CardContent>
    </Card>
  );
}
