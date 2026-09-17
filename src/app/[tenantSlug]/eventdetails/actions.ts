"use server";

import { getPublishedTenantBySlug } from "@/modules/tenants/tenant";
import { submitEventDetails, type EventDetailsIntakeInput } from "@/modules/menu-approvals/menu-approval";
import type { FoodType, MealType, VenueType, VehicleAccessType } from "@/generated/prisma/enums";

export type ActionResult = { ok: true; menuSelectionId: string } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function numberField(formData: FormData, name: string): number | undefined {
  const value = stringField(formData, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildInput(formData: FormData): EventDetailsIntakeInput {
  const name = stringField(formData, "name");
  if (!name) throw new Error("Your Name is required.");
  const email = stringField(formData, "email");
  if (!email) throw new Error("Email Address is required.");
  const phone = stringField(formData, "phone");
  if (!phone) throw new Error("Phone Number is required.");
  const eventTypeId = stringField(formData, "eventTypeId");
  if (!eventTypeId) throw new Error("Event Type is required.");
  const eventDateRaw = stringField(formData, "eventDate");
  if (!eventDateRaw) throw new Error("Event Date is required.");
  const guestCount = numberField(formData, "guestCount");
  if (!guestCount) throw new Error("Number of Guests is required.");
  const eventMealType = stringField(formData, "eventMealType") as MealType | undefined;
  if (!eventMealType) throw new Error("Event Time is required.");
  const menuPreference = stringField(formData, "menuPreference") as FoodType | undefined;
  if (!menuPreference) throw new Error("Menu Preference is required.");

  return {
    name,
    email,
    phone,
    eventTypeId,
    eventDate: new Date(eventDateRaw),
    guestCount,
    childBelow5Count: numberField(formData, "childBelow5Count"),
    child5To10Count: numberField(formData, "child5To10Count"),
    eventMealType,
    menuPreference,
    venueType: stringField(formData, "venueType") as VenueType | undefined,
    venueBuildingName: stringField(formData, "venueBuildingName"),
    venueDoorNumber: stringField(formData, "venueDoorNumber"),
    venueTower: stringField(formData, "venueTower"),
    venueFloor: stringField(formData, "venueFloor"),
    venueHallName: stringField(formData, "venueHallName"),
    completeVenueAddress: stringField(formData, "completeVenueAddress"),
    venueLandmark: stringField(formData, "venueLandmark"),
    venueContactName: stringField(formData, "venueContactName"),
    venueContactPhone: stringField(formData, "venueContactPhone"),
    venueLatitude: numberField(formData, "venueLatitude"),
    venueLongitude: numberField(formData, "venueLongitude"),
    venueAccessInstructions: stringField(formData, "venueAccessInstructions"),
    vehicleAccess: stringField(formData, "vehicleAccess") as VehicleAccessType | undefined,
    liveCounterAvailable: formData.get("liveCounterAvailable") === "true" ? true : formData.get("liveCounterAvailable") === "false" ? false : undefined,
  };
}

/**
 * Chunk 11 Group 11.2 — the public intake form's submit action. No session:
 * `tenantSlug` resolves the Organization, same as the Chunk 8 storefront
 * itself (this form is reached from that same tenant-wide Public Menu
 * Link — see dev plans/chunk-11.md's 2026-09-17 redesign).
 */
export async function submitEventDetailsAction(tenantSlug: string, formData: FormData): Promise<ActionResult> {
  const organization = await getPublishedTenantBySlug(tenantSlug);
  if (!organization) return { ok: false, error: "This page is no longer available." };

  try {
    const input = buildInput(formData);
    const { menuSelection } = await submitEventDetails(organization.id, input);
    return { ok: true, menuSelectionId: menuSelection.id };
  } catch (error) {
    return toErrorResult(error);
  }
}
