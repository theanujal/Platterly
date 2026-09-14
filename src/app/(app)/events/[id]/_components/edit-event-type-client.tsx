"use client";

import { useRouter } from "next/navigation";
import { EventTypeForm, type EventTypeFormValues } from "../../_components/event-type-form";
import { updateEventTypeAction } from "../../actions";

interface EditEventTypeClientProps {
  eventTypeId: string;
  initialValues: EventTypeFormValues;
  availableMenus: { id: string; name: string }[];
}

export function EditEventTypeClient({ eventTypeId, initialValues, availableMenus }: EditEventTypeClientProps) {
  const router = useRouter();

  return (
    <EventTypeForm
      availableMenus={availableMenus}
      initialValues={initialValues}
      submitLabel="Save changes"
      onSubmit={(formData) => updateEventTypeAction(eventTypeId, initialValues.imageUrl ?? undefined, formData)}
      onSuccess={() => router.push("/events")}
    />
  );
}
