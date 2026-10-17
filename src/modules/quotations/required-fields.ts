/**
 * What every quotation needs before it is saved, sent or turned into an order (AJ, 2026-10-18): the event type, the event date, where it is
 * (the venue location) and the guests, adults at least. The customer is checked on its own. Meals, dishes and prices come after. Pure and
 * client-safe, so the form and the server say the same thing.
 */
export interface QuotationRequiredInput {
  eventTypeId?: string | null;
  eventStartDate?: Date | string | null;
  eventEndDate?: Date | string | null;
  venue?: string | null;
  adultCount?: number | string | null;
}

/** The first required field that is missing, named as the form names it, or null when there is none. */
export function quotationMissingField(input: QuotationRequiredInput): string | null {
  if (!input.eventTypeId) return "Event Type";
  if (!input.eventStartDate || !input.eventEndDate) return "Event Date";
  if (!input.venue?.trim()) return "Venue Location";
  if (!(Number(input.adultCount) >= 1)) return "Adults";
  return null;
}

export const quotationMissingMessage = (field: string) => (field === "Adults" ? "Adults: enter at least 1 guest." : `${field} is required.`);
