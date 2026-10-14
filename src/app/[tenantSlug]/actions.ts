"use server";

import { publicActionLimited } from "@/lib/public-rate-limit";
import { getPublishedTenantBySlug } from "@/modules/tenants/tenant";
import {
  startDraft,
  saveDraftDetails,
  saveDraftMenuChoice,
  saveDraftItems,
  saveDraftAddOns,
  submitDraft,
  getDraft,
  buildDraftQuote,
  StorefrontDraftError,
  type EventDetailsInput,
  type MenuChoice,
  type DraftQuote,
} from "@/modules/menu-approvals/storefront-draft";
import type { FoodType, MealType } from "@/generated/prisma/enums";

// Chunk 12 — every public storefront mutation. The tenant is resolved from
// the URL slug on each call (never a client-supplied id), and only
// StorefrontDraftError messages reach the visitor; anything else is logged
// and replaced with a generic line.

export type StepResult = { ok: true } | { ok: false; error: string };
export type StartResult = { ok: true; draftId: string } | { ok: false; error: string };
export type SubmitResult = { ok: true; isCustomMenu: boolean } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  if (error instanceof StorefrontDraftError) return { ok: false, error: error.message };
  console.error("[storefront]", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

async function resolveOrganization(tenantSlug: string) {
  const organization = await getPublishedTenantBySlug(tenantSlug);
  if (!organization) throw new StorefrontDraftError("This kitchen isn't taking requests right now.");
  return organization;
}

async function tooManyRequests(bucket: string, limit: number): Promise<boolean> {
  return publicActionLimited(bucket, limit);
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function count(formData: FormData, name: string): number {
  const value = text(formData, name);
  return value === "" ? 0 : Number(value);
}

function readEventDetails(formData: FormData): EventDetailsInput {
  return {
    eventTypeId: text(formData, "eventTypeId"),
    eventDate: text(formData, "eventDate"),
    guestCount: count(formData, "guestCount"),
    childBelow5Count: count(formData, "childBelow5Count"),
    child5To10Count: count(formData, "child5To10Count"),
    eventMealTypes: formData.getAll("eventMealTypes").map(String) as MealType[],
    menuPreference: text(formData, "menuPreference") as FoodType,
    venueLocation: text(formData, "venueLocation"),
  };
}

export async function startDraftAction(tenantSlug: string, formData: FormData): Promise<StartResult> {
  try {
    const organization = await resolveOrganization(tenantSlug);
    if (await tooManyRequests("start", 15)) return { ok: false, error: "Too many attempts. Please try again in a little while." };
    const { draft } = await startDraft(organization.id, {
      ...readEventDetails(formData),
      name: text(formData, "name"),
      email: text(formData, "email"),
      phone: text(formData, "phone"),
      marketingConsent: text(formData, "marketingConsent") === "true",
      visitId: text(formData, "visitId") || undefined,
    });
    return { ok: true, draftId: draft.id };
  } catch (error) {
    return fail(error);
  }
}

export async function saveDetailsAction(tenantSlug: string, draftId: string, formData: FormData): Promise<StepResult> {
  try {
    const organization = await resolveOrganization(tenantSlug);
    await saveDraftDetails(organization.id, draftId, readEventDetails(formData));
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function saveMenuChoiceAction(tenantSlug: string, draftId: string, mealType: MealType, choice: MenuChoice): Promise<StepResult> {
  try {
    const organization = await resolveOrganization(tenantSlug);
    await saveDraftMenuChoice(organization.id, draftId, choice, mealType);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function saveItemsAction(tenantSlug: string, draftId: string, mealType: MealType, itemIds: string[]): Promise<StepResult> {
  try {
    const organization = await resolveOrganization(tenantSlug);
    await saveDraftItems(organization.id, draftId, { itemIds, mealType });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function saveAddOnsAction(tenantSlug: string, draftId: string, mealType: MealType, addOnIds: string[]): Promise<StepResult> {
  try {
    const organization = await resolveOrganization(tenantSlug);
    await saveDraftAddOns(organization.id, draftId, addOnIds, mealType);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Build Your Menu's one Continue, for one meal (AJ, 2026-10-12: every meal has its own menu): saves the menu choice, the
 * dishes and the add-ons together, in that order, through the same three functions the separate steps used (so every rule,
 * including the category minimums, still applies).
 */
export async function saveBuildMenuAction(
  tenantSlug: string,
  draftId: string,
  mealType: MealType,
  input: { choice: MenuChoice; itemIds: string[]; addOnIds: string[] },
): Promise<StepResult> {
  try {
    const organization = await resolveOrganization(tenantSlug);
    await saveDraftMenuChoice(organization.id, draftId, input.choice, mealType);
    await saveDraftItems(organization.id, draftId, { itemIds: input.itemIds, mealType });
    await saveDraftAddOns(organization.id, draftId, input.addOnIds, mealType);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export type EstimateResult = { ok: true; quote: DraftQuote } | { ok: false };

/**
 * The running "Estimated Total" on Build Your Menu: the exact same calculation the Review step and the submit use
 * (`buildDraftQuote`), run on the picks as they stand right now without saving them. The meals already done count too.
 */
export async function estimateQuoteAction(
  tenantSlug: string,
  draftId: string,
  mealType: MealType,
  input: { choice: MenuChoice; itemIds: string[]; addOnIds: string[] },
): Promise<EstimateResult> {
  try {
    const organization = await resolveOrganization(tenantSlug);
    const draft = await getDraft(organization.id, draftId);
    if (!draft || draft.status === "COMPLETED") return { ok: false };
    if (!draft.data.eventMealTypes.includes(mealType)) return { ok: false };
    const quote = await buildDraftQuote(organization.id, { ...draft.data, meals: { ...draft.data.meals, [mealType]: { menuChoice: input.choice, itemIds: input.itemIds, addOnIds: input.addOnIds } } });
    return { ok: true, quote };
  } catch {
    return { ok: false };
  }
}

export async function submitDraftAction(tenantSlug: string, draftId: string, notes: string): Promise<SubmitResult> {
  try {
    const organization = await resolveOrganization(tenantSlug);
    if (await tooManyRequests("submit", 10)) return { ok: false, error: "Too many attempts. Please try again in a little while." };
    const result = await submitDraft(organization.id, draftId, notes);
    return { ok: true, isCustomMenu: result.isCustomMenu };
  } catch (error) {
    return fail(error);
  }
}
