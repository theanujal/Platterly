import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { normalizePhone, isValidPhone } from "@/lib/phone";
import { findCustomerByPhone, createCustomer } from "@/modules/customers/customer";
import { createOrder, createEventForOrder, computeChildrenCharge, type OrderItemCatalogInput } from "@/modules/orders/order";
import { listKitchens } from "@/modules/events/event";
import { getMenuForOrderPicker } from "@/modules/menus/menu";
import { createMenuSelection, setMenuSelectionItems, type MenuSelectionItemInput } from "./menu-approval";
import { ABANDONED_AFTER_MS, isDraftExpired, DRAFT_PURGE_DAYS } from "./storefront-draft-constants";
import { splitPicks } from "./storefront-selection";
import { earliestPublicEventDate, PUBLIC_MIN_LEAD_DAYS } from "./public-lead-time";
import type { FoodType, MealType, VenueType, VehicleAccessType, Prisma } from "@/generated/prisma/client";

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
  /** yyyy-mm-dd */
  eventDate: string;
  guestCount: number;
  childBelow5Count: number;
  child5To10Count: number;
  eventMealType: MealType;
  menuPreference: FoodType;
}

export interface StartDraftInput extends EventDetailsInput {
  name: string;
  email: string;
  phone: string;
  marketingConsent: boolean;
}

export interface DraftVenue {
  venueType: VenueType;
  venueBuildingName: string;
  venueDoorNumber: string;
  venueTower?: string;
  venueFloor?: string;
  venueHallName: string;
  completeVenueAddress: string;
  venueLandmark?: string;
  venueContactName: string;
  venueContactPhone: string;
  venueAccessInstructions?: string;
  vehicleAccess: VehicleAccessType;
  liveCounterAvailable: boolean;
}

export type MenuChoice = { kind: "MENU"; menuId: string } | { kind: "CUSTOM" };

export interface DraftData extends EventDetailsInput {
  menuChoice?: MenuChoice;
  /** In the order the visitor picked them — extras are derived from this order. */
  itemIds?: string[];
  addOnIds?: string[];
  venue?: DraftVenue;
}

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

  const isCount = (n: number) => Number.isInteger(n) && n >= 0;
  if (!Number.isInteger(details.guestCount) || details.guestCount < 1) throw new StorefrontDraftError("Number of Guests is required.");
  if (eventType.minGuests && details.guestCount < eventType.minGuests) {
    throw new StorefrontDraftError(`${eventType.name} needs at least ${eventType.minGuests} guests.`);
  }
  if (!isCount(details.childBelow5Count) || !isCount(details.child5To10Count)) throw new StorefrontDraftError("Kids counts must be zero or more.");

  return { ...details, eventDate: details.eventDate.slice(0, 10) };
}

function readData(draft: { data: Prisma.JsonValue }): DraftData {
  return draft.data as unknown as DraftData;
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
  if (!customer) {
    customer = await createCustomer(organizationId, { name, phone, email, isEnquiry: true, leadSource: "STOREFRONT" });
  }
  if (customer.marketingConsent !== input.marketingConsent) {
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: { marketingConsent: input.marketingConsent, marketingConsentAt: new Date() },
    });
  }

  await purgeExpiredDrafts(organizationId);
  const draft = await prisma.storefrontDraft.create({
    data: { organizationId, customerId: customer.id, currentStep: 2, data: details as unknown as Prisma.InputJsonValue },
  });
  return { draft, customer };
}

/** Back-button edit of step 1 on an existing draft (contact fields stay as saved). */
export async function saveDraftDetails(organizationId: string, draftId: string, input: EventDetailsInput) {
  const draft = await loadEditableDraft(organizationId, draftId);
  const before = readData(draft);
  const details = await validateEventDetails(organizationId, input);

  const next: DraftData = { ...before, ...details };
  // A different event type or veg/non-veg preference changes which menus are
  // valid, so the earlier menu + item picks can't be trusted any more.
  if (before.eventTypeId !== details.eventTypeId || before.menuPreference !== details.menuPreference) {
    delete next.menuChoice;
    delete next.itemIds;
  }
  return saveDraft(draftId, next, 2, draft.currentStep);
}

// --- step 2: menu -------------------------------------------------------

export async function saveDraftMenuChoice(organizationId: string, draftId: string, choice: MenuChoice) {
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

  const changed = JSON.stringify(before.menuChoice) !== JSON.stringify(choice);
  const next: DraftData = { ...before, menuChoice: choice };
  if (changed) delete next.itemIds;
  return saveDraft(draftId, next, 3, draft.currentStep);
}

// --- step 3: items + add-ons --------------------------------------------

interface PickableItem {
  id: string;
  name: string;
  price: number;
}

/**
 * Splits the visitor's ordered picks into regular items and extras, entirely
 * server-side: within each category the first `maxSelection` picks are
 * included in the plate price, and any beyond that are extras (priced price x
 * guests). Throws if a pick isn't actually offered on the chosen menu.
 */
async function classifyItems(organizationId: string, data: DraftData, itemIds: string[]) {
  const items = new Map<string, PickableItem>();
  const regularIds: string[] = [];
  const extraIds: string[] = [];

  if (data.menuChoice?.kind === "MENU") {
    const menu = await getMenuForOrderPicker(organizationId, data.menuChoice.menuId);
    if (!menu) throw new StorefrontDraftError("That menu is no longer available.");

    for (const section of menu.sections) for (const item of section.items) items.set(item.id, item);

    const split = splitPicks(menu.sections, itemIds);
    if (split.unknownIds.length > 0) throw new StorefrontDraftError("One of your picks isn't on the chosen menu.");
    regularIds.push(...split.regularIds);
    extraIds.push(...split.extraIds);
  } else if (data.menuChoice?.kind === "CUSTOM") {
    const found = await prisma.menuItem.findMany({
      where: {
        id: { in: itemIds },
        organizationId,
        isActive: true,
        ...(data.menuPreference === "VEGETARIAN" ? { foodType: "VEGETARIAN" } : {}),
      },
    });
    if (found.length !== itemIds.length) throw new StorefrontDraftError("One of your picks isn't available.");
    found.forEach((item) => items.set(item.id, { id: item.id, name: item.name, price: Number(item.price) }));
    regularIds.push(...itemIds);
  } else {
    throw new StorefrontDraftError("Please choose a menu first.");
  }

  return { items, regularIds, extraIds };
}

export async function saveDraftItems(organizationId: string, draftId: string, input: { itemIds: string[]; addOnIds: string[] }) {
  const draft = await loadEditableDraft(organizationId, draftId);
  const before = readData(draft);

  const itemIds = [...new Set(input.itemIds)];
  const addOnIds = [...new Set(input.addOnIds)];
  if (itemIds.length === 0) throw new StorefrontDraftError("Please select at least one menu item.");

  await classifyItems(organizationId, before, itemIds);

  if (addOnIds.length > 0) {
    const count = await prisma.addOn.count({ where: { id: { in: addOnIds }, organizationId, isActive: true } });
    if (count !== addOnIds.length) throw new StorefrontDraftError("One of your add-ons isn't available.");
  }

  return saveDraft(draftId, { ...before, itemIds, addOnIds }, 4, draft.currentStep);
}

// --- step 4: venue ------------------------------------------------------

export async function saveDraftVenue(organizationId: string, draftId: string, venue: DraftVenue) {
  const draft = await loadEditableDraft(organizationId, draftId);
  const before = readData(draft);
  if (!before.itemIds?.length) throw new StorefrontDraftError("Please choose your menu items first.");

  const cleaned: DraftVenue = {
    venueType: venue.venueType,
    venueBuildingName: requireText(venue.venueBuildingName, "Venue / Building Name"),
    venueDoorNumber: requireText(venue.venueDoorNumber, "Door / Flat / House No."),
    venueTower: venue.venueTower?.trim() || undefined,
    venueFloor: venue.venueFloor?.trim() || undefined,
    venueHallName: requireText(venue.venueHallName, "Function Area / Hall Name"),
    completeVenueAddress: requireText(venue.completeVenueAddress, "Complete Venue Address"),
    venueLandmark: venue.venueLandmark?.trim() || undefined,
    venueContactName: requireText(venue.venueContactName, "Venue Contact Person"),
    venueContactPhone: requireText(venue.venueContactPhone, "Contact Number"),
    venueAccessInstructions: venue.venueAccessInstructions?.trim() || undefined,
    vehicleAccess: venue.vehicleAccess,
    liveCounterAvailable: venue.liveCounterAvailable === true,
  };
  if (!cleaned.venueType) throw new StorefrontDraftError("Venue Type is required.");
  if (!cleaned.vehicleAccess) throw new StorefrontDraftError("Vehicle Access is required.");

  return saveDraft(draftId, { ...before, venue: cleaned }, 5, draft.currentStep);
}

// --- step 5: quote + submit ---------------------------------------------

export interface DraftQuote {
  isCustomMenu: boolean;
  menuName: string | null;
  pricePerPlate: number | null;
  guests: number;
  /** Menu price x guests (0 for a Custom Menu — the kitchen quotes it). */
  menuAmount: number;
  extras: { id: string; name: string; price: number; amount: number }[];
  addOns: { id: string; name: string; priceType: "PER_PLATE" | "FIXED"; price: number; amount: number }[];
  childrenCharge: number;
  total: number;
}

/** The one pricing calculation — the Review step displays it and `submitDraft` books it, so they can't disagree. */
export async function buildDraftQuote(organizationId: string, data: DraftData): Promise<DraftQuote> {
  const guests = data.guestCount;
  const isCustomMenu = data.menuChoice?.kind === "CUSTOM";
  const menu =
    data.menuChoice?.kind === "MENU" ? await prisma.menu.findFirst({ where: { id: data.menuChoice.menuId, organizationId } }) : null;
  if (data.menuChoice?.kind === "MENU" && !menu) throw new StorefrontDraftError("That menu is no longer available.");

  const { items, extraIds } = await classifyItems(organizationId, data, data.itemIds ?? []);
  const extras = extraIds.map((id) => {
    const item = items.get(id)!;
    return { id, name: item.name, price: item.price, amount: item.price * guests };
  });

  const addOnRecords = data.addOnIds?.length
    ? await prisma.addOn.findMany({ where: { id: { in: data.addOnIds }, organizationId, isActive: true } })
    : [];
  const addOns = addOnRecords.map((addOn) => ({
    id: addOn.id,
    name: addOn.name,
    priceType: addOn.priceType,
    price: Number(addOn.price),
    amount: addOn.priceType === "PER_PLATE" ? Number(addOn.price) * guests : Number(addOn.price),
  }));

  const pricePerPlate = menu ? Number(menu.pricePerPlate) : null;
  const menuAmount = pricePerPlate !== null ? pricePerPlate * guests : 0;
  const childrenCharge = computeChildrenCharge(menu, data.childBelow5Count, data.child5To10Count);
  const total = menuAmount + extras.reduce((s, e) => s + e.amount, 0) + addOns.reduce((s, a) => s + a.amount, 0) + childrenCharge;

  return { isCustomMenu, menuName: menu?.name ?? null, pricePerPlate, guests, menuAmount, extras, addOns, childrenCharge, total };
}

/**
 * The final Submit. Claims the draft atomically (a double-click can't create
 * two Orders), then builds Customer-linked Order -> Event -> MenuSelection. The
 * order lands as Pending Review (AJ, 2026-09-26): the team checks it and sends
 * the menu to the customer for approval — the visitor doesn't approve their own
 * submission any more. The chosen Menu's plate
 * price rides on the Order's one meal-plan entry (Individual Pricing), extras
 * and per-plate add-ons as guest-count-quantity items, so the Order's own
 * totals engine produces the same figure the Review step showed. Anonymous —
 * no actor, same as the rest of the public flow.
 */
export async function submitDraft(organizationId: string, draftId: string, notes?: string) {
  const draft = await loadEditableDraft(organizationId, draftId);
  const data = readData(draft);
  if (!data.menuChoice || !data.itemIds?.length || !data.venue) throw new StorefrontDraftError("Please complete every step before submitting.");

  const claimed = await prisma.storefrontDraft.updateMany({
    where: { id: draftId, organizationId, status: "IN_PROGRESS" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  if (claimed.count === 0) throw new StorefrontDraftError("This request has already been submitted.");

  try {
    const quote = await buildDraftQuote(organizationId, data);
    const { regularIds, extraIds } = await classifyItems(organizationId, data, data.itemIds);
    const eventDate = new Date(data.eventDate);
    const venue = data.venue;
    const guests = data.guestCount;

    const mealItems: OrderItemCatalogInput[] = [
      ...extraIds.map((id) => ({ itemType: "MENU_ITEM" as const, catalogId: id, quantity: guests })),
      ...quote.addOns.map((a) => ({ itemType: "ADD_ON" as const, catalogId: a.id, quantity: a.priceType === "PER_PLATE" ? guests : 1 })),
    ];

    const order = await createOrder(organizationId, {
      customerId: draft.customerId,
      eventTypeId: data.eventTypeId,
      eventStartDate: eventDate,
      eventEndDate: eventDate,
      venue: venue.venueBuildingName,
      eventAddress: venue.completeVenueAddress,
      totalParticipants: guests,
      childBelow5Count: data.childBelow5Count,
      child5To10Count: data.child5To10Count,
      individualPricingEnabled: true,
      notes: notes?.trim() || undefined,
      mealPlanEntries: [
        {
          date: eventDate,
          mealType: data.eventMealType,
          menuId: data.menuChoice.kind === "MENU" ? data.menuChoice.menuId : null,
          price: quote.menuAmount,
          items: mealItems,
        },
      ],
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        menuPreference: data.menuPreference,
        eventMealType: data.eventMealType,
        venueType: venue.venueType,
        venueDoorNumber: venue.venueDoorNumber,
        venueTower: venue.venueTower,
        venueFloor: venue.venueFloor,
        venueHallName: venue.venueHallName,
        venueLandmark: venue.venueLandmark,
        venueContactName: venue.venueContactName,
        venueContactPhone: venue.venueContactPhone,
        venueAccessInstructions: venue.venueAccessInstructions,
        vehicleAccess: venue.vehicleAccess,
        liveCounterAvailable: venue.liveCounterAvailable,
      },
    });

    const event = await createEventForOrder(organizationId, order.id);
    const [defaultKitchen] = await listKitchens(organizationId);
    if (defaultKitchen) await prisma.event.update({ where: { id: event.id }, data: { assignedKitchenId: defaultKitchen.id } });

    const menuSelection = await createMenuSelection(organizationId, event.id, {
      chosenMenuId: data.menuChoice.kind === "MENU" ? data.menuChoice.menuId : null,
      isCustomMenu: data.menuChoice.kind === "CUSTOM",
    });

    const selectionItems: MenuSelectionItemInput[] = [
      ...regularIds.map((id) => ({ itemType: "MENU_ITEM" as const, catalogId: id })),
      ...extraIds.map((id) => ({ itemType: "MENU_ITEM" as const, catalogId: id, isExtra: true })),
      ...quote.addOns.map((a) => ({ itemType: "ADD_ON" as const, catalogId: a.id })),
    ];
    await setMenuSelectionItems(organizationId, menuSelection.id, selectionItems);

    await prisma.storefrontDraft.update({ where: { id: draftId }, data: { orderId: order.id } });
    await audit({
      organizationId,
      action: "storefront.order_submitted",
      recordType: "MenuSelection",
      recordId: menuSelection.id,
      after: { customerId: draft.customerId, orderId: order.id, eventId: event.id, isCustomMenu: quote.isCustomMenu, total: quote.total },
    });

    return { orderId: order.id, menuSelectionId: menuSelection.id, isCustomMenu: quote.isCustomMenu };
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
      eventMealType: data.eventMealType,
      menuPreference: data.menuPreference,
      // Only set once the visitor reaches the Venue & Delivery step.
      venueName: data.venue?.venueBuildingName ?? null,
    };
  });
}
