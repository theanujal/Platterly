"use client";

import { useRouter } from "next/navigation";
import { AddDrawer } from "@/components/catalog/form-drawer";
import { EventTypeForm } from "./event-type-form";
import { createEventTypeAction } from "../actions";

export function AddEventTypeDrawer({ availableMenus, variant = "button" }: { availableMenus: { id: string; name: string }[]; variant?: "button" | "tile" }) {
  const router = useRouter();

  return (
    <AddDrawer
      variant={variant}
      buttonLabel="Add Event Type"
      tileLabel="Add New Event Type"
      tileDescription="e.g. Wedding, Corporate Lunch"
      title="New Event Type"
      description="A type of event you cater, e.g. Wedding Event."
    >
      {(close) => (
        <EventTypeForm
          availableMenus={availableMenus}
          submitLabel="Create event"
          onSubmit={createEventTypeAction}
          onCancel={close}
          onSuccess={() => {
            close();
            router.refresh();
          }}
        />
      )}
    </AddDrawer>
  );
}
