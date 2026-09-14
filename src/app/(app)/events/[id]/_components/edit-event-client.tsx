"use client";

import { useRouter } from "next/navigation";
import { EventForm, type EventFormValues } from "../../_components/event-form";
import { updateEventAction } from "../../actions";

interface EditEventClientProps {
  eventId: string;
  initialValues: EventFormValues;
  customers: { id: string; name: string; phone: string }[];
  eventTypes: { id: string; name: string }[];
  kitchens: { id: string; name: string; isDefault: boolean }[];
  inventoryItems: { id: string; name: string; unit: string }[];
}

export function EditEventClient({ eventId, initialValues, customers, eventTypes, kitchens, inventoryItems }: EditEventClientProps) {
  const router = useRouter();

  return (
    <EventForm
      customers={customers}
      eventTypes={eventTypes}
      kitchens={kitchens}
      inventoryItems={inventoryItems}
      initialValues={initialValues}
      showStatus
      submitLabel="Save changes"
      onSubmit={(formData) => updateEventAction(eventId, formData)}
      onSuccess={() => router.push("/events")}
    />
  );
}
