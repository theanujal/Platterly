"use client";

import { useRouter } from "next/navigation";
import { EventForm } from "../../_components/event-form";
import { createEventAction } from "../../actions";

interface NewEventClientProps {
  customers: { id: string; name: string; phone: string }[];
  eventTypes: { id: string; name: string }[];
  kitchens: { id: string; name: string; isDefault: boolean }[];
  inventoryItems: { id: string; name: string; unit: string }[];
}

export function NewEventClient({ customers, eventTypes, kitchens, inventoryItems }: NewEventClientProps) {
  const router = useRouter();

  return (
    <EventForm
      customers={customers}
      eventTypes={eventTypes}
      kitchens={kitchens}
      inventoryItems={inventoryItems}
      submitLabel="Create event"
      onSubmit={createEventAction}
      onSuccess={() => router.push("/events")}
    />
  );
}
