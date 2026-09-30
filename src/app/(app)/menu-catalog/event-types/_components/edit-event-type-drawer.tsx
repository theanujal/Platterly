"use client";

import { useRouter } from "next/navigation";
import { FormDrawer } from "@/components/catalog/form-drawer";
import { EventTypeForm, type EventTypeFormValues } from "./event-type-form";
import { updateEventTypeAction } from "../actions";

interface EditEventTypeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTypeId: string;
  initialValues: EventTypeFormValues;
  availableMenus: { id: string; name: string }[];
}

export function EditEventTypeDrawer({ open, onOpenChange, eventTypeId, initialValues, availableMenus }: EditEventTypeDrawerProps) {
  const router = useRouter();

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Edit Event Type">
      <EventTypeForm
        availableMenus={availableMenus}
        initialValues={initialValues}
        submitLabel="Save changes"
        onSubmit={(formData) => updateEventTypeAction(eventTypeId, initialValues.imageUrl ?? undefined, formData)}
        onCancel={() => onOpenChange(false)}
        onSuccess={() => {
          onOpenChange(false);
          router.refresh();
        }}
      />
    </FormDrawer>
  );
}
