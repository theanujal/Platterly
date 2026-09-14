"use client";

import { useRouter } from "next/navigation";
import { EventTypeForm } from "../../_components/event-type-form";
import { createEventTypeAction } from "../../actions";

export function NewEventTypeClient({ availableMenus }: { availableMenus: { id: string; name: string }[] }) {
  const router = useRouter();

  return (
    <EventTypeForm
      availableMenus={availableMenus}
      submitLabel="Create event"
      onSubmit={createEventTypeAction}
      onSuccess={() => router.push("/events")}
    />
  );
}
