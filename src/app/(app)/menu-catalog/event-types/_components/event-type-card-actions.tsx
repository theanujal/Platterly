"use client";

import { useState } from "react";
import { CatalogCardMenu } from "@/components/catalog/catalog-card-menu";
import { EditEventTypeDrawer } from "./edit-event-type-drawer";
import type { EventTypeFormValues } from "./event-type-form";
import { deleteEventTypeAction, duplicateEventTypeAction, setEventTypeActiveAction } from "../actions";

interface EventTypeCardActionsProps {
  eventTypeId: string;
  name: string;
  initialValues: EventTypeFormValues;
  availableMenus: { id: string; name: string }[];
  variant?: "overlay" | "plain";
}

/** 3-dot menu for an Event Type card, or the Edit / Duplicate / Delete icons for a list row. Edit opens the drawer. */
export function EventTypeCardActions({ eventTypeId, name, initialValues, availableMenus, variant }: EventTypeCardActionsProps) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <CatalogCardMenu
        name={name}
        entityLabel="Event Type"
        isActive={initialValues.isActive}
        variant={variant}
        onEdit={() => setEditOpen(true)}
        onDuplicate={() => duplicateEventTypeAction(eventTypeId)}
        onSetActive={(active) => setEventTypeActiveAction(eventTypeId, active)}
        onDelete={() => deleteEventTypeAction(eventTypeId)}
        deleteDescription="The menus it references aren't deleted, only this event type."
      />
      <EditEventTypeDrawer open={editOpen} onOpenChange={setEditOpen} eventTypeId={eventTypeId} initialValues={initialValues} availableMenus={availableMenus} />
    </>
  );
}
