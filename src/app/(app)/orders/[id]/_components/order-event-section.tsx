"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarRange, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createEventForOrderAction, updateOrderEventAction } from "../../actions";

interface LinkedEvent {
  id: string;
  eventTypeId: string;
  assignedKitchenId: string | null;
  guestCount: number | null;
  venue: string | null;
  status: string;
}

interface OrderEventSectionProps {
  orderId: string;
  events: LinkedEvent[];
  eventTypes: { id: string; name: string }[];
  kitchens: { id: string; name: string }[];
}

/**
 * The Order/Event judgment call (dev plans/index.md #14, Group 10.6): a
 * single-event Order should read as one screen to the caterer even though
 * Order and Event stay two separate underlying records. Pre-creation, this
 * IS Group 10.6's "Create an event for this order?" prompt, inline rather
 * than a popup; post-creation, it's an inline editor for the Event's own
 * operational fields (EventType/Kitchen/guests/venue), not just a link out.
 */
export function OrderEventSection({ orderId, events, eventTypes, kitchens }: OrderEventSectionProps) {
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
              <Button type="button" size="sm" disabled={creating} onClick={handleCreate}>
                {creating ? "Creating…" : "Yes, create event"}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled>
                I&apos;ll do it later
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((event) => (
            <InlineEventEditor key={event.id} event={event} eventTypes={eventTypes} kitchens={kitchens} />
          ))}
        </div>
      )}
    </section>
  );
}

function InlineEventEditor({
  event,
  eventTypes,
  kitchens,
}: {
  event: LinkedEvent;
  eventTypes: { id: string; name: string }[];
  kitchens: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [eventTypeId, setEventTypeId] = useState(event.eventTypeId);
  const [assignedKitchenId, setAssignedKitchenId] = useState(event.assignedKitchenId ?? "");
  const [guestCount, setGuestCount] = useState(event.guestCount?.toString() ?? "");
  const [venue, setVenue] = useState(event.venue ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setPending(true);
    setError(null);
    setSaved(false);
    const formData = new FormData();
    formData.set("eventTypeId", eventTypeId);
    formData.set("assignedKitchenId", assignedKitchenId);
    formData.set("guestCount", guestCount);
    formData.set("venue", venue);
    const result = await updateOrderEventAction(event.id, formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <CalendarRange className="size-4 text-muted-foreground" />
            Event details
          </span>
          <Link href={`/events/${event.id}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
            View full Event
            <ExternalLink className="size-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inline-event-type">Event Type</Label>
            <Select value={eventTypeId} onValueChange={(v) => setEventTypeId(v ?? eventTypeId)}>
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
            <Select value={assignedKitchenId} onValueChange={(v) => setAssignedKitchenId(v ?? assignedKitchenId)}>
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
            <Label htmlFor="inline-event-guests">Guest Count</Label>
            <Input id="inline-event-guests" type="number" min="0" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inline-event-venue">Venue</Label>
            <Input id="inline-event-venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={handleSave}>
            {pending ? "Saving…" : "Save Event details"}
          </Button>
          {saved && <span className="text-xs text-emerald-600">Saved.</span>}
        </div>
      </CardContent>
    </Card>
  );
}
