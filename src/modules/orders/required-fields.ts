/**
 * What every order can't go without (AJ, 2026-10-18), the same four a quotation needs: the event type, the event date, the venue location
 * (the venue / building name) and the guests, adults at least. The customer is checked on its own. Meals and dishes come after, built in
 * the Menu Approval tab. Pure and client-safe, so the form and the server say the same thing.
 */
export interface OrderRequiredInput {
  eventTypeId?: string | null;
  eventStartDate?: Date | string | null;
  eventEndDate?: Date | string | null;
  venue?: string | null;
  adultCount?: number | string | null;
}

/** Every required field that is missing, named as the form names it, in the order the form asks for them. */
export function orderMissingFields(input: OrderRequiredInput): string[] {
  const missing: string[] = [];
  if (!input.eventTypeId) missing.push("Event Type");
  if (!input.eventStartDate || !input.eventEndDate) missing.push("Event Date");
  if (!input.venue?.trim()) missing.push("Venue / Building Name");
  if (!(Number(input.adultCount) >= 1)) missing.push("Adults");
  return missing;
}

/**
 * The first required field a save would leave empty. A new order needs all of them. A saved order is only stopped from clearing one it had:
 * an older order that never had a venue can still be saved (its Event Information card says what it needs) instead of being locked out.
 */
export function orderBlockingField(next: OrderRequiredInput, saved?: OrderRequiredInput | null): string | null {
  const alreadyMissing = saved ? orderMissingFields(saved) : [];
  return orderMissingFields(next).find((field) => !alreadyMissing.includes(field)) ?? null;
}

export const orderMissingMessage = (field: string) => (field === "Adults" ? "Adults: enter at least 1 guest." : `${field} is required.`);
