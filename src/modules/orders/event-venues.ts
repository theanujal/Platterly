import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { MealType, VenueType } from "@/generated/prisma/enums";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/db";

/**
 * The venue and delivery details of an order, for the whole order or one per event (a meal slot: a date and a meal).
 * Shared by the customer's Venue & Delivery step and the team's Order Details, so both check and save them the same way.
 */
export interface VenueDetailsInput {
  venueType: string;
  venueBuildingName: string;
  venueDoorNumber?: string;
  venueTower?: string;
  venueFloor?: string;
  completeVenueAddress: string;
  venueLandmark?: string;
  venueContactName: string;
  venueContactPhone: string;
  venueAccessInstructions?: string;
  cookingInstructions?: string;
  gasElectricAvailable?: boolean;
  liveCounterAvailable?: boolean;
}

/** One event's venue as the form sends it: the event's key ("YYYY-MM-DD-MEALTYPE") and its details. */
export interface EventVenueInput {
  key: string;
  details: VenueDetailsInput;
}

const VENUE_TYPES: VenueType[] = ["CLUBHOUSE", "HOTEL", "BANQUET_HALL", "RESORT", "HOME", "OFFICE", "OTHER"];
const FIELD_MAX = 1000;

/** A validation message a person can read as-is. */
export class VenueDetailsError extends Error {}

function cleanText(value: string | undefined, label: string, required = false): string | null {
  const trimmed = value?.trim() ?? "";
  if (required && trimmed.length === 0) throw new VenueDetailsError(`${label} is required.`);
  if (trimmed.length > FIELD_MAX) throw new VenueDetailsError(`${label} is too long.`);
  return trimmed.length > 0 ? trimmed : null;
}

/** Validates one venue form and returns it as Order / OrderEventVenue columns (the two share names). */
export function cleanVenue(input: VenueDetailsInput, where = "") {
  const at = (label: string) => `${label}${where}`;
  if (!VENUE_TYPES.includes(input.venueType as VenueType)) throw new VenueDetailsError(`${at("Venue Type")} is required.`);
  const phone = normalizePhone(input.venueContactPhone?.trim() ?? "");
  if (!phone) throw new VenueDetailsError(`${at("Contact Number")} is required.`);
  if (!isValidPhone(phone)) throw new VenueDetailsError(`Please enter a valid contact number for the selected country${where}.`);
  return {
    venueType: input.venueType as VenueType,
    venue: cleanText(input.venueBuildingName, at("Venue / Building Name"), true)!,
    venueDoorNumber: cleanText(input.venueDoorNumber, "Door / Flat / House No."),
    venueTower: cleanText(input.venueTower, "Tower / Block"),
    venueFloor: cleanText(input.venueFloor, "Floor"),
    eventAddress: cleanText(input.completeVenueAddress, at("Complete Venue Address"), true)!,
    venueLandmark: cleanText(input.venueLandmark, "Landmark"),
    venueContactName: cleanText(input.venueContactName, at("Contact Person"), true)!,
    venueContactPhone: phone,
    venueAccessInstructions: cleanText(input.venueAccessInstructions, "Loading / Access Instructions"),
    cookingInstructions: cleanText(input.cookingInstructions, "Cooking Instructions"),
    gasElectricAvailable: input.gasElectricAvailable === true,
    liveCounterAvailable: input.liveCounterAvailable === true,
  };
}

export type CleanVenue = ReturnType<typeof cleanVenue>;
export type PerEventVenue = { date: Date; mealType: MealType; data: CleanVenue };

/** The event key used by the customer's page and the forms: the day and the meal, e.g. "2026-12-05-LUNCH". */
export const eventKey = (date: Date | string, mealType: MealType | string) => `${typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10)}-${mealType}`;

/**
 * Checks one venue per event against the events (meal slots) the order really has: no more and no fewer, at least two. Returns them
 * in event order (Event 1, Event 2, ...), each cleaned. Throws a message for the first thing missing.
 */
export function cleanEventVenues(slots: { date: string; mealType: MealType }[], sent: EventVenueInput[]): PerEventVenue[] {
  const ordered = [...new Map(slots.map((slot) => [eventKey(slot.date, slot.mealType), slot])).entries()].sort(([x], [y]) => x.localeCompare(y));
  const keys = sent.map((event) => event.key);
  if (ordered.length < 2 || keys.length !== ordered.length || ordered.some(([key]) => !keys.includes(key))) throw new VenueDetailsError("Please give the venue details for every event.");
  const byKey = new Map(sent.map((event) => [event.key, event.details]));
  return ordered.map(([key, slot], index) => ({ date: new Date(`${slot.date.slice(0, 10)}T00:00:00.000Z`), mealType: slot.mealType, data: cleanVenue(byKey.get(key)!, ` (Event ${index + 1})`) }));
}

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Writes the order's venue choice: one venue for the whole order (`events` null) or one per event. The order's own venue columns
 * mirror the first event, so everything that reads one venue still has one.
 */
export async function writeEventVenues(db: Db, orderId: string, events: PerEventVenue[] | null) {
  await db.orderEventVenue.deleteMany({ where: { orderId } });
  for (const event of events ?? []) await db.orderEventVenue.create({ data: { orderId, date: event.date, mealType: event.mealType, ...event.data } });
  await db.order.update({ where: { id: orderId }, data: { venuePerEvent: events !== null, ...(events ? events[0].data : {}) } });
}

/** The team's Order Details save: applies the venue choice the form sent against the meals the order has now. */
export async function applyEventVenues(db: Db, orderId: string, choice: { perEvent: boolean; events?: EventVenueInput[] }) {
  if (!choice.perEvent) {
    await db.orderEventVenue.deleteMany({ where: { orderId } });
    await db.order.update({ where: { id: orderId }, data: { venuePerEvent: false } });
    return;
  }
  const meals = await db.mealPlanEntry.findMany({ where: { orderId }, select: { date: true, mealType: true } });
  const slots = meals.map((meal) => ({ date: meal.date.toISOString().slice(0, 10), mealType: meal.mealType }));
  await writeEventVenues(db, orderId, cleanEventVenues(slots, choice.events ?? []));
}
