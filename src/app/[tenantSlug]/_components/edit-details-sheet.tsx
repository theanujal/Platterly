"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EventDetailsForm, type EventDetailsFormValues } from "./event-details-form";

export interface EditDetails {
  businessName: string;
  eventTypes: { id: string; name: string; minGuests: number | null }[];
  values: EventDetailsFormValues;
}

/**
 * The event details in a side panel (AJ, 2026-10-14), opened from Edit on Build Your Menu and on the Review step so the
 * customer never leaves the page: same fields, same save as the details step. The parent refreshes the page on save.
 */
export function EditDetailsSheet({ tenantSlug, draftId, details, open, onOpenChange, onSaved }: { tenantSlug: string; draftId: string; details: EditDetails; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Edit Event Details</SheetTitle>
          <SheetDescription>Your menu and dish choices stay on this page.</SheetDescription>
        </SheetHeader>
        <EventDetailsForm tenantSlug={tenantSlug} businessName={details.businessName} eventTypes={details.eventTypes} draft={{ id: draftId, values: details.values }} onSaved={onSaved} />
      </SheetContent>
    </Sheet>
  );
}
