import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { normalizePhone, isValidPhone } from "@/lib/phone";
import { findCustomerByPhone, createCustomer } from "@/modules/customers/customer";
import { createOrder, createEventForOrder, computeChildrenCharge, type OrderItemCatalogInput } from "@/modules/orders/order";
import { ownVisitId } from "@/modules/storefront-visits/visits";
import { addOnOfferedOnMenu } from "@/modules/addons/addon";
import { getMenuForOrderPicker, type OrderPickerSection } from "@/modules/menus/menu";
import { createMenuSelection, mirrorSelectionItemsFromMealPlan } from "./menu-approval";
import { onNewLead } from "@/modules/notifications/triggers";
import { ABANDONED_AFTER_MS, isDraftExpired, DRAFT_PURGE_DAYS } from "./storefront-draft-constants";
import { requiredShortfalls, splitPicks } from "./storefront-selection";
import { earliestPublicEventDate, PUBLIC_MIN_LEAD_DAYS } from "./public-lead-time";
import type { FoodType, MealType, Prisma } from "@/generated/prisma/client";

// Chunk 12 (2026-09-25) — the public storefront's multi-step order flow,
// server side. A visitor is saved as a Lead (Customer with no Order) the
// moment step 1 is submitted; each later step autosaves into a
// StorefrontDraft; the Order/Event/MenuSelection only come into existence at
// the final Submit (`submitDraft`). Every function takes the tenant id
// resolved from the public URL slug — nothing tenant-related ever comes from
// the browser.

/** User-facing validation failure — the message is safe to show to a visitor. */
export class StorefrontDraftError extends Error {}

export interface EventDetailsInput {
  eventTypeId: string;
  /** yyyy-mm-dd: the first (or only) day. */
  eventDate: string;
  /** yyyy-mm-dd: the last day of a Multi Order's date range; the same as `eventDate` (or absent) for one day. */
  eventEndDate?: string;
  guestCount: number;
  childBelow5Count: number;
  child5To10Count: number;
  /** "Meals Required" — one or more meals on each event day. The menu, dishes and add-ons repeat for each meal, and for each day of a date range. */
  eventMealTypes: MealType[];
  menuPreference: FoodType;
  /** Where the event is (an area, locality or address). The detailed venue and delivery information is collected after the customer approves the menu. */
  venueLocation: string;
  /** What the visitor chose first: a Single Order holds one meal, a Multi Order one or more (each with its own menu). Not stored; the meals are what the order is built from. */
  orderType?: "SINGLE" | "MULTI";
}

export interface StartDraftInput extends EventDetailsInput {
  name: string;
  email: string;
  phone: string;
  marketingConsent: boolean;
  /** The storefront visit this journey came from (Chunk 22); only trusted if it belongs to this kitchen. */
  visitId?: string;
}

/** Drafts saved before 2026-10-02 carried the full Venue & Delivery form; only its address is still read (as the Venue Location). */
interface LegacyDraftVenue {
  completeVenueAddress?: string;
}

export type MenuChoice = { kind: "MENU"; menuId: string } | { kind: "CUSTOM" };

/** One meal's own picks (AJ, 2026-10-12): each meal chooses its own menu, dishes and add-ons. */
export interface MealSelection {
  menuChoice?: MenuChoice;
  /** In the order the visitor picked them — extras are derived from this order. */
  itemIds?: string[];
  addOnIds?: string[];
}

/** The meals in the order they are shown, priced and booked. */
export const MEAL_ORDER: MealType[] = ["BREAKFAST", "LUNCH", "HITEA", "DINNER", "OTHER"];

export interface DraftData extends EventDetailsInput {
  /** Per meal; a meal with nothing picked yet has no entry. Drafts saved before 2026-10-12 held one set of picks for every meal. */
  meals: Partial<Record<MealType, MealSelection>>;
  venue?: LegacyDraftVenue;
}

/** Whether a meal has a menu and every required dish: the same rule the server re-checks when it is saved. */
export function isMealComplete(selection: MealSelection | undefined): boolean {
  return !!selection?.menuChoice && (selection.itemIds?.length ?? 0) > 0;
}

/** Every day of the event, first to last (one entry for a single day). Days are yyyy-mm-dd, counted in UTC like the order's own dates. */
export function draftDays(data: { eventDate: string; eventEndDate?: string }): string[] {
  const start = data.eventDate.slice(0, 10);
  const end = (data.eventEndDate ?? start).slice(0, 10);
  const days: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`) && days.length < MAX_EVENT_DAYS; t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10));
  return days.length > 0 ? days : [start];
}

/** A Multi Order's date range is capped, so a typo cannot book a year of meals. */
export const MAX_EVENT_DAYS = 31;

// --- validation helpers -------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireText(value: string | undefined, label: string, min = 1): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length < min) throw new StorefrontDraftError(`${label} is required.`);
  return trimmed;
}

async function validateEventDetails(organizationId: string, details: EventDetailsInput): Promise<EventDetailsInput> {
  const eventType = await prisma.eventType.findFirst({ where: { id: details.eventTypeId, organizationId, isActive: true } });
  if (!eventType) throw new StorefrontDraftError("Please choose a valid event type.");

  const date = new Date(details.eventDate);
  if (Number.isNaN(date.getTime())) throw new StorefrontDraftError("Event Date is required.");
  // Customers need 2 days' notice (AJ, 2026-09-27): today and tomorrow can't be picked, and neither can a past date.
  const chosen = details.eventDate.slice(0, 10);
  if (chosen < earliestPublicEventDate(new Date(Date.now() - PUBLIC_MIN_LEAD_DAYS * 86_400_000))) {
    throw new StorefrontDraftError("Event Date can't be in the past.");
  }
  if (chosen < earliestPublicEventDate()) {
    throw new StorefrontDraftError(`Please pick a date at least ${PUBLIC_MIN_LEAD_DAYS} days from today — we need that much notice.`);
  }

  const endChosen = (details.eventEndDate || details.eventDate).slice(0, 10);
  if (Number.isNaN(new Date(endChosen).getTime())) throw new StorefrontDraftError("Event end date is not a valid date.");
  if (endChosen < chosen) throw new StorefrontDraftError("The event end date can't be before the start date.");
  if ((Date.parse(`${endChosen}T00:00:00Z`) - Date.parse(`${chosen}T00:00:00Z`)) / 86_400_000 + 1 > MAX_EVENT_DAYS) {
    throw new StorefrontDraftError(`An event can run up to ${MAX_EVENT_DAYS} days.`);
  }

  const isCount = (n: number) => Number.isInteger(n) && n >= 0;
  if (!Number.isInteger(details.guestCount) || details.guestCount < 1) throw new StorefrontDraftError("Number of Adults is required.");
  if (eventType.minGuests && details.guestCount < eventType.minGuests) {
    throw new StorefrontDraftError(`${eventType.name} needs at least ${eventType.minGuests} guests.`);
  }
  const requested = new Set(details.eventMealTypes ?? []);
  const meals = MEAL_ORDER.filter((meal) => requested.has(meal));
  if (meals.length === 0) throw new StorefrontDraftError("Please choose at least one meal.");
  if (details.orderType === "SINGLE" && (meals.length > 1 || endChosen > chosen)) throw new StorefrontDraftError("A Single Order has one date and one meal. Choose Multi Order for several meals or dates.");

  if (!isCount(details.childBelow5Count) || !isCount(details.child5To10Count)) throw new StorefrontDraftError("Kids counts must be zero or more.");

  const venueLocation = requireText(details.venueLocation, "Venue Location");

  return { ...details, orderType: undefined, eventMealTypes: meals, eventDate: chosen, eventEndDate: endChosen, venueLocation };
}

function readData(draft: { data: Prisma.JsonValue }): DraftData {
  const data = draft.data as unknown as Omit<DraftData, "meals"> & {
    meals?: DraftData["meals"];
    eventMealType?: MealType;
    menuChoice?: MenuChoice;
    itemIds?: string[];
    addOnIds?: string[];
  };
  // Drafts saved before "Meals Required" held a single meal.
  if (!data.eventMealTypes) data.eventMealTypes = data.eventMealType ? [data.eventMealType] : [];
  // Drafts saved before date ranges ran one day.
  if (!data.eventEndDate) data.eventEndDate = data.eventDate;
  // Drafts saved before the 3-step flow have no Venue Location; their old venue address stands in for it.
  if (!data.venueLocation) data.venueLocation = data.venue?.completeVenueAddress ?? "";
  // Drafts saved before 2026-10-12 had one menu, one dish list and one add-on list that every meal repeated.
  if (!data.meals) {
    const shared: MealSelection = { menuChoice: data.menuChoice, itemIds: data.itemIds, addOnIds: data.addOnIds };
    data.meals = shared.menuChoice || shared.itemIds?.length || shared.addOnIds?.length ? Object.fromEntries(data.eventMealTypes.map((meal) => [meal, { ...shared }])) : {};
  }
  return data as DraftData;
}

async function loadEditableDraft(organizationId: string, draftId: string) {
  const draft = await prisma.storefrontDraft.findFirst({ where: { id: draftId, organizationId }, include: { customer: true } });
  if (!draft) throw new StorefrontDraftError("We couldn't find this request. Please start again.");
  if (draft.status === "COMPLETED") throw new StorefrontDraftError("This request has already been submitted.");
  return draft;
}

async function saveDraft(draftId: string, data: DraftData, reachedStep: number, currentStep: number) {
  return prisma.storefrontDraft.update({
    where: { id: draftId },
    data: { data: data as unknown as Prisma.InputJsonValue, currentStep: Math.max(currentStep, reachedStep), lastActivityAt: new Date() },
  });
}

// --- step 1: contact + event details ------------------------------------

/**
 * Step 1's submit: validates, saves the visitor as a Lead (Customer, matched
 * by normalized phone — an existing customer keeps their stored name/email),
 * records their consent choice, and opens the draft. Someone who leaves
 * before this step has left no contact details, so there is nothing to keep.
 */
export async function startDraft(organizationId: string, input: StartDraftInput) {
  const name = requireText(input.name, "Your Name", 2);
  const email = requireText(input.email, "Email Address");
  if (!EMAIL_PATTERN.test(email)) throw new StorefrontDraftError("Please enter a valid email address.");
  const phone = normalizePhone(requireText(input.phone, "Phone Number"));
  if (!isValidPhone(phone)) throw new StorefrontDraftError("Please enter a valid phone number for the selected country.");
  const details = await validateEventDetails(organizationId, input);

  let customer = await findCustomerByPhone(organizationId, phone);
  let isNewLead = false;
  if (!customer) {
    customer = await createCustomer(organizationId, { name, phone, email, isEnquiry: true, leadSource: "STOREFRONT" });
    isNewLead = true;
  }
  if (customer.marketingConsent !== input.marketingConsent) {
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: { marketingConsent: input.marketingConsent, marketingConsentAt: new Date() },
    });
  }

  await purgeExpiredDrafts(organizationId);
  const draft = await prisma.storefrontDraft.create({
    data: { organizationId, customerId: customer.id, currentStep: 2, data: details as unknown as Prisma.InputJsonValue, visitId: await ownVisitId(organizationId, input.visitId) },
  });
  if (isNewLead) await onNewLead(organizationId, customer.id);
  return { draft, customer };
}

/** Back-button edit of step 1 on an existing draft (contact fields stay as saved). */
export async function saveDraftDetails(organizationId: string, draftId: string, input: EventDetailsInput) {
  const draft = await loadEditableDraft(organizationId, draftId);
  const before = readData(draft);
  const details = await validateEventDetails(organizationId, input);

  // A different event type or veg/non-veg preference changes which menus are valid, so every meal's earlier menu and
  // dish picks can't be trusted any more. Otherwise a meal that stays keeps its picks, and one that is dropped goes.
  const resetPicks = before.eventTypeId !== details.eventTypeId || before.menuPreference !== details.menuPreference;
  const meals: DraftData["meals"] = {};
  for (const meal of details.eventMealTypes) {
    const kept = before.meals[meal];
    if (!kept) continue;
    meals[meal] = resetPicks ? { addOnIds: kept.addOnIds } : kept;
  }
  const next: DraftData = { ...before, ...details, meals };
  return saveDraft(draftId, next, 2, draft.currentStep);
}

/** Which meals a save applies to: the one named, or (no meal named) every meal the visitor asked for, as before 2026-10-12. */
function targetMeals(data: DraftData, mealType?: MealType): MealType[] {
  if (!mealType) return data.eventMealTypes;
  if (!data.eventMealTypes.includes(mealType)) throw new StorefrontDraftError("That meal isn't part of your request.");
  return [mealType];
}

/** Every meal chosen has its menu and dishes. */
export function allMealsComplete(data: DraftData): boolean {
  return data.eventMealTypes.length > 0 && data.eventMealTypes.every((meal) => isMealComplete(data.meals[meal]));
}

// --- step 2: Build Your Menu (menu choice, dishes, add-ons), one meal at a time ----------

export async function saveDraftMenuChoice(organizationId: string, draftId: string, choice: MenuChoice, mealType?: MealType) {
  const draft = await loadEditableDraft(organizationId, draftId);
  const before = readData(draft);

  if (choice.kind === "MENU") {
    const menu = await prisma.menu.findFirst({
      where: {
        id: choice.menuId,
        organizationId,
        isActive: true,
        menuType: before.menuPreference,
        eventTypes: { some: { eventTypeId: before.eventTypeId } },
      },
    });
    if (!menu) throw new StorefrontDraftError("That menu isn't available for your event. Please choose another.");
  }

  const meals = { ...before.meals };
  for (const meal of targetMeals(before, mealType)) {
    const current = meals[meal] ?? {};
    const changed = JSON.stringify(current.menuChoice) !== JSON.stringify(choice);
    // A different menu may not offer every add-on picked so far; those drop out.
    const keptAddOnIds = changed && current.addOnIds?.length ? await addOnIdsOfferedOn(organizationId, current.addOnIds, choice) : current.addOnIds;
    meals[meal] = changed ? { menuChoice: choice, addOnIds: keptAddOnIds } : { ...current, menuChoice: choice };
  }
  return saveDraft(draftId, { ...before, meals }, 2, draft.currentStep);
}

// --- dishes and add-ons --------------------------------------------

interface PickableItem {
  id: string;
  name: string;
  price: number;
}

/**
 * Splits one meal's ordered picks into regular items and extras, entirely
 * server-side: within each category the first `maxSelection` picks are
 * included in the plate price, and any beyond that are extras (priced price x
 * guests). Throws if a pick isn't actually offered on the chosen menu.
 */
async function classifyItems(organizationId: string, menuPreference: FoodType, selection: MealSelection, itemIds: string[]) {
  const items = new Map<string, PickableItem>();
  const regularIds: string[] = [];
  const extraIds: string[] = [];
  let menuSections: OrderPickerSection[] | null = null;

  if (selection.menuChoice?.kind === "MENU") {
    const menu = await getMenuForOrderPicker(organizationId, selection.menuChoice.menuId);
    if (!menu) throw new StorefrontDraftError("That menu is no longer available.");

    menuSections = menu.sections;
    for (const section of menu.sections) for (const item of section.items) items.set(item.id, item);

    const split = splitPicks(menu.sections, itemIds);
    if (split.unknownIds.length > 0) throw new StorefrontDraftError("One of your picks isn't on the chosen menu.");
    regularIds.push(...split.regularIds);
    extraIds.push(...split.extraIds);
  } else if (selection.menuChoice?.kind === "CUSTOM") {
    const found = await prisma.menuItem.findMany({
      where: {
        id: { in: itemIds },
        organizationId,
        isActive: true,
        ...(menuPreference === "VEGETARIAN" ? { foodType: "VEGETARIAN" } : {}),
      },
    });
    if (found.length !== itemIds.length) throw new StorefrontDraftError("One of your picks isn't available.");
    found.forEach((item) => items.set(item.id, { id: item.id, name: item.name, price: Number(item.price) }));
    regularIds.push(...itemIds);
  } else {
    throw new StorefrontDraftError("Please choose a menu first.");
  }

  return { items, regularIds, extraIds, menuSections };
}

/**
 * The dishes of one meal. Every category with a limit needs its full count of included dishes picked (or every dish it
 * has, when it has fewer) before this saves, the same "compulsory" rule the admin picker uses (`requiredShortfalls`),
 * so the customer and the team cannot end up with different ideas of a complete menu. Extras do not count.
 * `addOnIds` stays as it was unless it is passed (kept for callers that still send both). With no `mealType` the same
 * dishes are saved for every meal (the single-menu behaviour from before 2026-10-12).
 */
export async function saveDraftItems(organizationId: string, draftId: string, input: { itemIds: string[]; addOnIds?: string[]; mealType?: MealType }) {
  const draft = await loadEditableDraft(organizationId, draftId);
  const before = readData(draft);

  const itemIds = [...new Set(input.itemIds)];
  if (itemIds.length === 0) throw new StorefrontDraftError("Please select at least one menu item.");
  if (input.addOnIds && input.addOnIds.length > 0) {
    await assertAddOnsAvailable(organizationId, [...new Set(input.addOnIds)], targetMeals(before, input.mealType).map((meal) => before.meals[meal]?.menuChoice));
  }

  const meals = { ...before.meals };
  for (const meal of targetMeals(before, input.mealType)) {
    const current = meals[meal] ?? {};
    const { menuSections } = await classifyItems(organizationId, before.menuPreference, current, itemIds);
    if (menuSections) {
      const short = requiredShortfalls(menuSections, itemIds);
      if (short.length > 0) {
        const first = short[0];
        throw new StorefrontDraftError(`Please choose at least ${first.missing} more item${first.missing === 1 ? "" : "s"} from ${first.name}.`);
      }
    }
    const addOnIds = input.addOnIds ? [...new Set(input.addOnIds)] : current.addOnIds;
    meals[meal] = { ...current, itemIds, addOnIds };
  }
  const next: DraftData = { ...before, meals };
  // The dishes alone do not unlock Review; saving the add-ons choice (which may be empty) does.
  return saveDraft(draftId, next, 2, draft.currentStep);
}

function choiceMenuId(choice: MenuChoice | undefined): string | null {
  return choice?.kind === "MENU" ? choice.menuId : null;
}

/** Which of these add-ons the chosen menu offers (a Custom Menu has no Menu, so it only gets add-ons for all menus). */
async function addOnIdsOfferedOn(organizationId: string, addOnIds: string[], choice: MenuChoice | undefined) {
  const addOns = await prisma.addOn.findMany({ where: { id: { in: addOnIds }, organizationId, isActive: true }, include: { menus: { select: { menuId: true } } } });
  return addOnIds.filter((id) => {
    const addOn = addOns.find((a) => a.id === id);
    return !!addOn && addOnOfferedOnMenu(addOn, choiceMenuId(choice));
  });
}

async function assertAddOnsAvailable(organizationId: string, addOnIds: string[], choices: (MenuChoice | undefined)[]) {
  const addOns = await prisma.addOn.findMany({ where: { id: { in: addOnIds }, organizationId, isActive: true }, include: { menus: { select: { menuId: true } } } });
  if (addOns.length !== addOnIds.length) throw new StorefrontDraftError("One of your add-ons isn't available.");
  if (addOns.filter((a) => a.type === "SETUP_STYLE").length > 1) throw new StorefrontDraftError("Please choose only one setup style.");
  for (const choice of choices) {
    if (addOns.some((a) => !addOnOfferedOnMenu(a, choiceMenuId(choice)))) throw new StorefrontDraftError("One of your add-ons isn't offered with your menu.");
  }
}

// --- add-ons and live counters ------------------------------------

/** Optional add-ons and live counters of one meal. May be empty; once every meal has its dishes this is what unlocks the Review step. */
export async function saveDraftAddOns(organizationId: string, draftId: string, addOnIds: string[], mealType?: MealType) {
  const draft = await loadEditableDraft(organizationId, draftId);
  const before = readData(draft);
  const targets = targetMeals(before, mealType);
  if (targets.some((meal) => !before.meals[meal]?.itemIds?.length)) throw new StorefrontDraftError("Please choose your menu items first.");

  const unique = [...new Set(addOnIds)];
  if (unique.length > 0) await assertAddOnsAvailable(organizationId, unique, targets.map((meal) => before.meals[meal]?.menuChoice));

  const meals = { ...before.meals };
  for (const meal of targets) meals[meal] = { ...meals[meal], addOnIds: unique };
  const next: DraftData = { ...before, meals };
  return saveDraft(draftId, next, allMealsComplete(next) ? 3 : 2, draft.currentStep);
}

// --- step 3: quote + submit ---------------------------------------------

export interface QuoteExtra {
  id: string;
  name: string;
  price: number;
  amount: number;
}
export interface QuoteAddOn {
  id: string;
  name: string;
  type: "LIVE_COUNTER" | "SPECIAL_ADD_ON" | "SETUP_STYLE";
  priceType: "PER_PLATE" | "FIXED";
  price: number;
  included: boolean;
  amount: number;
}

/** One meal's part of the quote: its own menu, extras and add-ons. */
export interface DraftMealQuote {
  mealType: MealType;
  isCustomMenu: boolean;
  menuName: string | null;
  pricePerPlate: number | null;
  /** Menu price x guests (0 for a Custom Menu: the kitchen quotes it). */
  menuAmount: number;
  extras: QuoteExtra[];
  addOns: QuoteAddOn[];
  /** The meal's menu, extras and add-ons (the kids' charge is for the whole order, not per meal). */
  total: number;
}

export interface DraftQuote {
  /** True when any meal is a Custom Menu: the kitchen quotes that meal's price. */
  isCustomMenu: boolean;
  /** The first meal's menu (a single-meal request has just this one). */
  menuName: string | null;
  pricePerPlate: number | null;
  /** Adults (the "Number of Adults" on the form); the menu price applies to them. One number for the whole order. */
  guests: number;
  /** How many meals are priced; every amount below already covers all of them. */
  meals: number;
  /** How many event days: each meal's menu, extras and add-ons are served every day, so their amounts already cover all of them. The kids' charge is once. */
  days: number;
  /** Menu price x guests, summed over the meals (0 for a Custom Menu). */
  menuAmount: number;
  /** The same dish or add-on on several meals is one line with the amounts added up. */
  extras: QuoteExtra[];
  addOns: QuoteAddOn[];
  childrenCharge: number;
  total: number;
  /** Each meal's own part, in the order the meals are served. */
  perMeal: DraftMealQuote[];
}

function mergeById<T extends { id: string; amount: number }>(lines: T[]): T[] {
  const merged = new Map<string, T>();
  for (const line of lines) {
    const found = merged.get(line.id);
    if (found) found.amount += line.amount;
    else merged.set(line.id, { ...line });
  }
  return [...merged.values()];
}

/**
 * The one pricing calculation — the Review step displays it and `submitDraft` books it, so they can't disagree. Each meal
 * is priced on its own menu; one guest number covers the whole order. A meal that has no menu yet is left out (the running
 * estimate on Build Your Menu counts the meals done so far). Kids are charged once, on the first meal's menu, exactly as the
 * Order's own pricing does.
 */
export async function buildDraftQuote(organizationId: string, data: DraftData): Promise<DraftQuote> {
  const guests = data.guestCount;
  // The same meals are served on every day of the event, so each meal's amounts are per day x days.
  const days = draftDays(data).length;
  const perMeal: DraftMealQuote[] = [];
  let childMenu: Awaited<ReturnType<typeof prisma.menu.findFirst>> = null;

  for (const mealType of data.eventMealTypes) {
    const selection = data.meals[mealType];
    if (!selection?.menuChoice) continue;
    const isCustomMenu = selection.menuChoice.kind === "CUSTOM";
    const menu = selection.menuChoice.kind === "MENU" ? await prisma.menu.findFirst({ where: { id: selection.menuChoice.menuId, organizationId } }) : null;
    if (selection.menuChoice.kind === "MENU" && !menu) throw new StorefrontDraftError("That menu is no longer available.");
    if (menu && !childMenu) childMenu = menu;

    const { items, extraIds } = await classifyItems(organizationId, data.menuPreference, selection, selection.itemIds ?? []);
    const extras = extraIds.map((id) => {
      const item = items.get(id)!;
      return { id, name: item.name, price: item.price, amount: item.price * guests * days };
    });
    const addOnRecords = selection.addOnIds?.length ? await prisma.addOn.findMany({ where: { id: { in: selection.addOnIds }, organizationId, isActive: true } }) : [];
    const addOns = addOnRecords.map((addOn) => ({
      id: addOn.id,
      name: addOn.name,
      type: addOn.type,
      priceType: addOn.priceType,
      price: Number(addOn.price),
      included: addOn.includedInPackage,
      amount: (addOn.includedInPackage ? 0 : addOn.priceType === "PER_PLATE" ? Number(addOn.price) * guests : Number(addOn.price)) * days,
    }));
    const pricePerPlate = menu ? Number(menu.pricePerPlate) : null;
    const menuAmount = pricePerPlate !== null ? pricePerPlate * guests * days : 0;
    perMeal.push({
      mealType,
      isCustomMenu,
      menuName: menu?.name ?? null,
      pricePerPlate,
      menuAmount,
      extras,
      addOns,
      total: menuAmount + extras.reduce((sum, e) => sum + e.amount, 0) + addOns.reduce((sum, a) => sum + a.amount, 0),
    });
  }

  const childrenCharge = computeChildrenCharge(childMenu, data.childBelow5Count, data.child5To10Count);
  const first = perMeal[0];
  const menuAmount = perMeal.reduce((sum, m) => sum + m.menuAmount, 0);
  return {
    isCustomMenu: perMeal.some((m) => m.isCustomMenu),
    menuName: perMeal.find((m) => m.menuName)?.menuName ?? null,
    pricePerPlate: first?.pricePerPlate ?? null,
    guests,
    meals: perMeal.length,
    days,
    menuAmount,
    extras: mergeById(perMeal.flatMap((m) => m.extras)),
    addOns: mergeById(perMeal.flatMap((m) => m.addOns)),
    childrenCharge,
    total: perMeal.reduce((sum, m) => sum + m.total, 0) + childrenCharge,
    perMeal,
  };
}

/**
 * The final Submit. Claims the draft atomically (a double-click can't create
 * two Orders), then builds Customer-linked Order -> Event -> MenuSelection. The
 * order lands as Pending Review (AJ, 2026-09-26): the team checks it and sends
 * the menu to the customer for approval — the visitor doesn't approve their own
 * submission any more. Each meal is its own meal-plan entry with its own Menu
 * (AJ, 2026-10-12), its plate price riding on the entry (Individual Pricing),
 * extras and per-plate add-ons as guest-count-quantity items, so the Order's own
 * totals engine produces the same figure the Review step showed. Anonymous —
 * no actor, same as the rest of the public flow.
 */
export async function submitDraft(organizationId: string, draftId: string, notes?: string) {
  const draft = await loadEditableDraft(organizationId, draftId);
  const data = readData(draft);
  if (!allMealsComplete(data) || !data.venueLocation) throw new StorefrontDraftError("Please complete every step before submitting.");

  const claimed = await prisma.storefrontDraft.updateMany({
    where: { id: draftId, organizationId, status: "IN_PROGRESS" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  if (claimed.count === 0) throw new StorefrontDraftError("This request has already been submitted.");

  try {
    const quote = await buildDraftQuote(organizationId, data);
    const days = draftDays(data);
    const eventDate = new Date(days[0]);
    const eventEndDate = new Date(days[days.length - 1]);
    const guests = data.guestCount;
    const mealTypes = data.eventMealTypes;

    // The whole menu goes on each meal so Menu Approvals shows it in the same planner as any order (AJ, 2026-09-30):
    // dishes inside the menu are included (they add nothing), Extras are charged per guest, add-ons as priced.
    const entries = [];
    for (const mealType of mealTypes) {
      const selection = data.meals[mealType]!;
      const { regularIds, extraIds } = await classifyItems(organizationId, data.menuPreference, selection, selection.itemIds ?? []);
      const mealQuote = quote.perMeal.find((m) => m.mealType === mealType)!;
      const mealItems: OrderItemCatalogInput[] = [
        ...regularIds.map((id) => ({ itemType: "MENU_ITEM" as const, catalogId: id, quantity: 1 })),
        ...extraIds.map((id) => ({ itemType: "MENU_ITEM" as const, catalogId: id, quantity: guests, isExtra: true })),
        ...mealQuote.addOns.map((a) => ({ itemType: "ADD_ON" as const, catalogId: a.id, quantity: a.priceType === "PER_PLATE" ? guests : 1 })),
      ];
      // The same meal on every day of the event, each its own entry the team can change in the Menu Approval planner.
      for (const day of days) {
        entries.push({
          date: new Date(day),
          mealType,
          menuId: selection.menuChoice!.kind === "MENU" ? selection.menuChoice!.menuId : null,
          // Individual Pricing is a per-plate price: the meal's own menu price (nothing for a Custom Menu until the kitchen quotes it).
          price: mealQuote.pricePerPlate ?? 0,
          items: mealItems.map((item) => ({ ...item })),
        });
      }
    }

    // A retry after a failure further down reuses the order the first attempt made, so the kitchen never gets two (issue 77).
    // ponytail: a retry reuses the first order as created; edits made to the draft between the failure and the retry don't reach it.
    // Rebuild the order from the draft on retry if that ever matters.
    const orderId =
      draft.orderId ??
      (
        await createOrder(organizationId, {
          customerId: draft.customerId,
          eventTypeId: data.eventTypeId,
          eventStartDate: eventDate,
          eventEndDate,
          orderKind: mealTypes.length > 1 || days.length > 1 ? "MULTI" : "SINGLE",
          // Only the location is known at this point; the venue and delivery details come after the customer approves.
          eventAddress: data.venueLocation,
          // "Number of Adults" on the form is the adults; children are counted on top.
          adultCount: guests,
          totalParticipants: guests + data.childBelow5Count + data.child5To10Count,
          childBelow5Count: data.childBelow5Count,
          child5To10Count: data.child5To10Count,
          individualPricingEnabled: true,
          notes: notes?.trim() || undefined,
          mealPlanEntries: entries,
        })
      ).id;
    if (!draft.orderId) await prisma.storefrontDraft.update({ where: { id: draftId }, data: { orderId } });

    await prisma.order.update({
      where: { id: orderId },
      data: {
        menuPreference: data.menuPreference,
        eventMealType: mealTypes[0],
      },
    });

    // One selection for the event: any Custom Menu meal makes it a quote the kitchen prices; the chosen menu is the first fixed one.
    const firstMenu = mealTypes.map((m) => data.meals[m]!.menuChoice!).find((c) => c.kind === "MENU");
    // All or nothing, so a failure never leaves an event without its selection behind for the retry to trip over.
    const { event, menuSelection } = await prisma.$transaction(async (tx) => {
      const event = await createEventForOrder(organizationId, orderId, undefined, undefined, tx);
      const menuSelection = await createMenuSelection(
        organizationId,
        event.id,
        { chosenMenuId: firstMenu?.kind === "MENU" ? firstMenu.menuId : null, isCustomMenu: quote.isCustomMenu },
        tx,
      );
      // The flat selection rows mirror the meal plan (a dish on several meals is listed once, as an Extra if any copy is).
      await mirrorSelectionItemsFromMealPlan(organizationId, menuSelection.id, tx);
      return { event, menuSelection };
    });

    await audit({
      organizationId,
      action: "storefront.order_submitted",
      recordType: "MenuSelection",
      recordId: menuSelection.id,
      after: { customerId: draft.customerId, orderId, eventId: event.id, isCustomMenu: quote.isCustomMenu, total: quote.total, meals: mealTypes },
    });

    return { orderId, menuSelectionId: menuSelection.id, isCustomMenu: quote.isCustomMenu };
  } catch (error) {
    // Nothing (or only part) was created — hand the draft back so the visitor can retry.
    await prisma.storefrontDraft.update({ where: { id: draftId }, data: { status: "IN_PROGRESS", completedAt: null } });
    throw error;
  }
}

// --- reads --------------------------------------------------------------

export async function getDraft(organizationId: string, draftId: string) {
  const draft = await prisma.storefrontDraft.findFirst({ where: { id: draftId, organizationId }, include: { customer: true } });
  if (!draft) return null;
  return { ...draft, data: readData(draft) };
}

/** The number a submitted request got as an Order (shown on the confirmation so the customer can quote it). */
export async function getDraftOrderNumber(organizationId: string, orderId: string | null): Promise<string | null> {
  if (!orderId) return null;
  const order = await prisma.order.findFirst({ where: { id: orderId, organizationId }, select: { orderNumber: true } });
  return order?.orderNumber ?? null;
}

async function purgeExpiredDrafts(organizationId: string) {
  const cutoff = new Date(Date.now() - DRAFT_PURGE_DAYS * 24 * 60 * 60 * 1000);
  await prisma.storefrontDraft.deleteMany({ where: { organizationId, lastActivityAt: { lt: cutoff } } });
}

export type AbandonedOrderState = "ABANDONED" | "ACTIVE" | "ALL";

/**
 * Admin's "Abandoned Orders" list: unfinished drafts, newest activity first.
 * "Abandoned" = idle for 30+ minutes; anything more recent is still "In
 * progress" (the visitor may just be choosing). Past DRAFT_EXPIRY_DAYS idle,
 * `isExpired` says the resume link no longer works, but the record stays
 * visible here; only past DRAFT_PURGE_DAYS (AJ, 2026-09-28: "purge after 3
 * months") is it actually deleted, on the way through this query.
 */
export async function listAbandonedOrders(organizationId: string, state: AbandonedOrderState = "ABANDONED") {
  await purgeExpiredDrafts(organizationId);
  const idleBefore = new Date(Date.now() - ABANDONED_AFTER_MS);
  const drafts = await prisma.storefrontDraft.findMany({
    where: {
      organizationId,
      status: "IN_PROGRESS",
      ...(state === "ABANDONED" ? { lastActivityAt: { lt: idleBefore } } : state === "ACTIVE" ? { lastActivityAt: { gte: idleBefore } } : {}),
    },
    include: { customer: true },
    orderBy: { lastActivityAt: "desc" },
  });

  const eventTypeIds = [...new Set(drafts.map((d) => readData(d).eventTypeId))];
  const eventTypes = await prisma.eventType.findMany({ where: { id: { in: eventTypeIds }, organizationId }, select: { id: true, name: true, icon: true } });
  const eventTypeById = new Map(eventTypes.map((e) => [e.id, e]));

  return drafts.map((draft) => {
    const data = readData(draft);
    const eventType = eventTypeById.get(data.eventTypeId);
    return {
      id: draft.id,
      customer: draft.customer,
      currentStep: draft.currentStep,
      lastActivityAt: draft.lastActivityAt,
      isAbandoned: draft.lastActivityAt < idleBefore,
      isExpired: isDraftExpired(draft.lastActivityAt),
      eventTypeName: eventType?.name ?? null,
      // Same icon the Order card looks up via getEventTypeIcon() — kept as the raw stored key here (client-safe), not resolved to a component.
      eventTypeIcon: eventType?.icon ?? null,
      eventDate: data.eventDate,
      guestCount: data.guestCount,
      eventMealTypes: data.eventMealTypes,
      menuPreference: data.menuPreference,
      venueName: data.venueLocation || null,
    };
  });
}
