import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  startDraft,
  saveDraftMenuChoice,
  saveDraftItems,
  saveDraftAddOns,
  submitDraft,
  saveDraftDetails,
  buildDraftQuote,
  allMealsComplete,
  getDraft,
  listAbandonedOrders,
  StorefrontDraftError,
  type StartDraftInput,
} from "@/modules/menu-approvals/storefront-draft";
import { setCustomMenuPricePerPlate } from "@/modules/menu-approvals/menu-approval";
import { splitPicks } from "@/modules/menu-approvals/storefront-selection";
import { createEventType } from "@/modules/events/event-type";
import { createMenu } from "@/modules/menus/menu";
import { createCategory } from "@/modules/menus/category";
import { createMenuItem } from "@/modules/menus/item";
import { createAddOn } from "@/modules/addons/addon";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

function futureDate(days = 60) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** A tenant with one veg Menu (Starters capped at 1, Mains capped at 2), an Event Type using it, and two add-ons. */
async function setup() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Draft Test Kitchen", slug: `draft-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
  });
  cleanupOrgIds.push(org.id);
  const actor = await prisma.user.create({
    data: { id: crypto.randomUUID(), name: "Owner", email: `owner-${crypto.randomUUID()}@example.test`, emailVerified: true },
  });
  cleanupUserIds.push(actor.id);

  const menu = await createMenu(
    org.id,
    { name: "Classic Veg", menuType: "VEGETARIAN", pricePerPlate: 500, child5To10PricingType: "PERCENTAGE", child5To10PriceValue: 50 },
    actor.id,
  );
  const starters = await createCategory(org.id, { name: "Starters", menuAssignments: [{ menuId: menu.id, maxSelection: 1 }] }, actor.id);
  const mains = await createCategory(org.id, { name: "Mains", menuAssignments: [{ menuId: menu.id, maxSelection: 2 }] }, actor.id);
  const tikka = await createMenuItem(org.id, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 100, menuIds: [menu.id], categoryIds: [starters.id] }, actor.id);
  const kebab = await createMenuItem(org.id, { name: "Veg Kebab", foodType: "VEGETARIAN", price: 120, menuIds: [menu.id], categoryIds: [starters.id] }, actor.id);
  const dal = await createMenuItem(org.id, { name: "Dal Makhani", foodType: "VEGETARIAN", price: 90, menuIds: [menu.id], categoryIds: [mains.id] }, actor.id);
  const outsider = await createMenuItem(org.id, { name: "Not On Menu", foodType: "VEGETARIAN", price: 50 }, actor.id);
  const eventType = await createEventType(org.id, { name: "Wedding", minGuests: 50, menuIds: [menu.id] }, actor.id);
  const perPlateAddOn = await createAddOn(org.id, { name: "Live Chaat", type: "LIVE_COUNTER", priceType: "PER_PLATE", price: 10 }, actor.id);
  const fixedAddOn = await createAddOn(org.id, { name: "Premium Crockery", type: "SPECIAL_ADD_ON", priceType: "FIXED", price: 1000 }, actor.id);

  const details = (over?: Partial<StartDraftInput>): StartDraftInput => ({
    name: "Asha Rao",
    email: "asha@example.test",
    phone: "9876543210",
    marketingConsent: true,
    eventTypeId: eventType.id,
    eventDate: futureDate(),
    guestCount: 60,
    childBelow5Count: 0,
    child5To10Count: 2,
    eventMealTypes: ["DINNER"],
    menuPreference: "VEGETARIAN",
    venueLocation: "Whitefield, Bangalore",
    ...over,
  });

  return { org, actor, menu, tikka, kebab, dal, outsider, eventType, perPlateAddOn, fixedAddOn, details };
}

describe("startDraft (step 1 — saves the visitor as a Lead)", () => {
  it("creates a Lead Customer with consent recorded and no Order", async () => {
    const t = await setup();
    const { customer, draft } = await startDraft(t.org.id, t.details());

    expect(customer.phone).toBe("+919876543210");
    expect(customer.isEnquiry).toBe(true);
    expect(customer.leadSource).toBe("STOREFRONT");
    expect(customer.marketingConsent).toBe(true);
    expect(customer.marketingConsentAt).not.toBeNull();
    expect(draft.currentStep).toBe(2);
    expect(await prisma.order.count({ where: { organizationId: t.org.id } })).toBe(0);
  });

  it("an unticked consent box is stored as not consented", async () => {
    const t = await setup();
    const { customer } = await startDraft(t.org.id, t.details({ marketingConsent: false }));
    expect(customer.marketingConsent).toBe(false);
  });

  it("a returning phone reuses the Customer and honours a withdrawn consent", async () => {
    const t = await setup();
    const first = await startDraft(t.org.id, t.details());
    const second = await startDraft(t.org.id, t.details({ marketingConsent: false }));
    expect(second.customer.id).toBe(first.customer.id);
    expect(second.customer.marketingConsent).toBe(false);
  });

  it("accepts a valid non-Indian number as-is (E.164) and rejects one that's the wrong length for its country", async () => {
    const t = await setup();
    const china = await startDraft(t.org.id, t.details({ phone: "+86 138 1234 5678" }));
    expect(china.customer.phone).toBe("+8613812345678");
    await expect(startDraft(t.org.id, t.details({ phone: "+86 138 1234 567" }))).rejects.toThrow(/valid phone number/);
  });

  it("rejects fewer guests than the Event Type's minimum, a past date, and a bad phone", async () => {
    const t = await setup();
    await expect(startDraft(t.org.id, t.details({ guestCount: 49 }))).rejects.toThrow(/at least 50/);
    await expect(startDraft(t.org.id, t.details({ eventDate: "2020-01-01" }))).rejects.toThrow(/past/);
    await expect(startDraft(t.org.id, t.details({ phone: "12345" }))).rejects.toBeInstanceOf(StorefrontDraftError);
  });

  it("needs 2 days' notice from a customer: today and tomorrow are refused, the day after is fine (AJ, 2026-09-27)", async () => {
    const t = await setup();
    const iso = (offsetDays: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offsetDays);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    await expect(startDraft(t.org.id, t.details({ eventDate: iso(0) }))).rejects.toThrow(/at least 2 days/);
    await expect(startDraft(t.org.id, t.details({ eventDate: iso(1) }))).rejects.toThrow(/at least 2 days/);
    await expect(startDraft(t.org.id, t.details({ eventDate: iso(-1) }))).rejects.toThrow(/past/);
    await expect(startDraft(t.org.id, t.details({ eventDate: iso(2) }))).resolves.toBeDefined();
  });
});

describe("menu + items steps (server-side rules)", () => {
  it("rejects a menu that isn't assigned to the event type, and one that doesn't match the preference", async () => {
    const t = await setup();
    const other = await createMenu(t.org.id, { name: "Unassigned", menuType: "VEGETARIAN", pricePerPlate: 300 }, t.actor.id);
    const { draft } = await startDraft(t.org.id, t.details());
    await expect(saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: other.id })).rejects.toThrow(/isn't available/);

    const nonVeg = await startDraft(t.org.id, t.details({ phone: "9876500000", menuPreference: "NON_VEGETARIAN" }));
    await expect(saveDraftMenuChoice(t.org.id, nonVeg.draft.id, { kind: "MENU", menuId: t.menu.id })).rejects.toThrow(/isn't available/);
  });

  it("rejects items that aren't on the chosen menu or an empty selection", async () => {
    const t = await setup();
    const { draft } = await startDraft(t.org.id, t.details());
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: t.menu.id });
    await expect(saveDraftItems(t.org.id, draft.id, { itemIds: [t.outsider.id], addOnIds: [] })).rejects.toThrow(/isn't on the chosen menu/);
    await expect(saveDraftItems(t.org.id, draft.id, { itemIds: [], addOnIds: [] })).rejects.toThrow(/at least one/);
  });

  it("a category with a limit must have its minimum picked before the dishes save (extras never count)", async () => {
    const t = await setup();
    const { draft } = await startDraft(t.org.id, t.details());
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: t.menu.id });
    // Starters is satisfied, Mains (one dish on the menu) is still empty.
    await expect(saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id] })).rejects.toThrow(/at least 1 more item from Mains/);
    // A second starter is an extra, so it cannot stand in for a missing main.
    await expect(saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.kebab.id] })).rejects.toThrow(/Mains/);
    const saved = await saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.dal.id] });
    expect(saved.currentStep).toBe(2); // the dishes alone do not unlock Review; saving the add-ons choice does
  });

  it("saves optional add-ons, unlocks the Review step, and rejects one that isn't available", async () => {
    const t = await setup();
    const { draft } = await startDraft(t.org.id, t.details());
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: t.menu.id });
    await expect(saveDraftAddOns(t.org.id, draft.id, [])).rejects.toThrow(/menu items first/);
    await saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.dal.id] });

    await expect(saveDraftAddOns(t.org.id, draft.id, ["not-an-add-on"])).rejects.toThrow(/isn't available/);
    const saved = await saveDraftAddOns(t.org.id, draft.id, [t.perPlateAddOn.id, t.perPlateAddOn.id]);
    expect(saved.currentStep).toBe(3);
    expect((await getDraft(t.org.id, draft.id))!.data.meals.DINNER?.addOnIds).toEqual([t.perPlateAddOn.id]); // repeats collapse

    // None at all is fine, and saving the dishes again keeps the chosen add-ons.
    await saveDraftAddOns(t.org.id, draft.id, []);
    await saveDraftAddOns(t.org.id, draft.id, [t.fixedAddOn.id]);
    await saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.dal.id] });
    expect((await getDraft(t.org.id, draft.id))!.data.meals.DINNER?.addOnIds).toEqual([t.fixedAddOn.id]);
  });

  it("an add-on tied to other menus is refused for this menu, and a Custom Menu only gets all-menus add-ons (2026-10-13)", async () => {
    const t = await setup();
    const otherMenu = await createMenu(t.org.id, { name: "Gold Veg", menuType: "VEGETARIAN", pricePerPlate: 900 }, t.actor.id);
    const forOther = await createAddOn(t.org.id, { name: "Gold Only", type: "SPECIAL_ADD_ON", priceType: "FIXED", price: 500, appliesToAllMenus: false, menuIds: [otherMenu.id] }, t.actor.id);
    const forThis = await createAddOn(t.org.id, { name: "Classic Only", type: "SPECIAL_ADD_ON", priceType: "FIXED", price: 500, appliesToAllMenus: false, menuIds: [t.menu.id] }, t.actor.id);

    const { draft } = await startDraft(t.org.id, t.details());
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: t.menu.id });
    await saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.dal.id] });
    await expect(saveDraftAddOns(t.org.id, draft.id, [forOther.id])).rejects.toThrow(/isn't offered with your menu/);
    await saveDraftAddOns(t.org.id, draft.id, [forThis.id, t.perPlateAddOn.id]);

    // Switching to a Custom Menu keeps only the add-ons offered with every menu.
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "CUSTOM" });
    expect((await getDraft(t.org.id, draft.id))!.data.meals.DINNER?.addOnIds).toEqual([t.perPlateAddOn.id]);
  });

  it("another tenant's draft id is simply not found", async () => {
    const a = await setup();
    const b = await setup();
    const { draft } = await startDraft(a.org.id, a.details());
    await expect(saveDraftMenuChoice(b.org.id, draft.id, { kind: "CUSTOM" })).rejects.toThrow(/couldn't find/);
    expect(await getDraft(b.org.id, draft.id)).toBeNull();
  });

  it("splitPicks marks picks beyond a category's cap as extras, in pick order", () => {
    const sections = [
      { maxSelection: 1, items: [{ id: "a" }, { id: "b" }] },
      { maxSelection: null, items: [{ id: "c" }] },
    ];
    const split = splitPicks(sections, ["a", "b", "c", "zzz"]);
    expect(split.regularIds).toEqual(["a", "c"]);
    expect(split.extraIds).toEqual(["b"]);
    expect(split.unknownIds).toEqual(["zzz"]);
  });
});

describe("Venue Location (the only venue detail asked before the lead is submitted)", () => {
  it("is required to start a draft and to edit the details", async () => {
    const t = await setup();
    await expect(startDraft(t.org.id, t.details({ venueLocation: "   " }))).rejects.toThrow(/Venue Location is required/);
    const { draft } = await startDraft(t.org.id, t.details());
    const before = (await getDraft(t.org.id, draft.id))!.data;
    await expect(saveDraftDetails(t.org.id, draft.id, { ...before, venueLocation: "" })).rejects.toThrow(/Venue Location is required/);
    await saveDraftDetails(t.org.id, draft.id, { ...before, venueLocation: "  Indiranagar  " });
    expect((await getDraft(t.org.id, draft.id))!.data.venueLocation).toBe("Indiranagar");
  });

  it("a draft saved before the 3-step flow uses its old venue address as the location", async () => {
    const t = await setup();
    const { draft } = await startDraft(t.org.id, t.details());
    const data = (await getDraft(t.org.id, draft.id))!.data as unknown as Record<string, unknown>;
    delete data.venueLocation;
    await prisma.storefrontDraft.update({ where: { id: draft.id }, data: { data: { ...data, venue: { completeVenueAddress: "12 Green Villa Road" } } as never } });
    expect((await getDraft(t.org.id, draft.id))!.data.venueLocation).toBe("12 Green Villa Road");
  });

  it("submitting needs a location", async () => {
    const t = await setup();
    const { draft } = await startDraft(t.org.id, t.details());
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: t.menu.id });
    await saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.dal.id] });
    const data = (await getDraft(t.org.id, draft.id))!.data as unknown as Record<string, unknown>;
    await prisma.storefrontDraft.update({ where: { id: draft.id }, data: { data: { ...data, venueLocation: "" } as never } });
    await expect(submitDraft(t.org.id, draft.id)).rejects.toThrow(/complete every step/);
  });
});

describe("quote + final submit (Order created only here)", () => {
  async function completeDraft(t: Awaited<ReturnType<typeof setup>>, overrides?: Partial<StartDraftInput>) {
    const { draft, customer } = await startDraft(t.org.id, t.details(overrides));
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: t.menu.id });
    // Two starters against a cap of 1: the second (kebab) is an extra.
    await saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.kebab.id, t.dal.id], addOnIds: [t.perPlateAddOn.id, t.fixedAddOn.id] });
    return { draft, customer };
  }

  it("prices menu x guests + extras x guests + add-ons + kids, entirely server-side", async () => {
    const t = await setup();
    const { draft } = await completeDraft(t);
    const data = (await getDraft(t.org.id, draft.id))!.data;
    const quote = await buildDraftQuote(t.org.id, data);

    expect(quote.menuAmount).toBe(500 * 60);
    expect(quote.extras).toEqual([expect.objectContaining({ name: "Veg Kebab", amount: 120 * 60 })]);
    expect(quote.addOns.map((a) => a.amount)).toEqual([10 * 60, 1000]);
    expect(quote.childrenCharge).toBe(2 * 250); // 5-10 yrs at 50% of the 500 plate
    expect(quote.total).toBe(30000 + 7200 + 600 + 1000 + 500);
  });

  it("creates the Order/Event/MenuSelection at submit, at the quoted total, with quantity 1 and the extra flagged", async () => {
    const t = await setup();
    const { draft, customer } = await completeDraft(t);
    expect(await prisma.order.count({ where: { organizationId: t.org.id } })).toBe(0); // nothing yet

    const result = await submitDraft(t.org.id, draft.id, "Please call before delivery");
    expect(result.isCustomMenu).toBe(false);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(order.customerId).toBe(customer.id);
    expect(Number(order.total)).toBe(39300);
    // "Number of Adults" is the adults; the two 5-10 kids sit on top.
    // Only the location is known before approval; the venue and delivery details come later.
    expect(order.eventAddress).toBe("Whitefield, Bangalore");
    expect(order.venueDoorNumber).toBeNull();
    expect(order.adultCount).toBe(60);
    expect(order.totalParticipants).toBe(62);
    expect(order.notes).toBe("Please call before delivery");

    const selection = await prisma.menuSelection.findUniqueOrThrow({ where: { id: result.menuSelectionId }, include: { items: true } });
    // Placed, not approved: the team reviews it and sends it to the customer (AJ, 2026-09-26).
    expect(selection.status).toBe("DRAFT");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } })).status).toBe("PENDING_REVIEW");
    expect(selection.chosenMenuId).toBe(t.menu.id);
    expect(selection.items.every((i) => i.quantity === 1)).toBe(true);
    expect(selection.items.filter((i) => i.isExtra).map((i) => i.name)).toEqual(["Veg Kebab"]);
    expect(selection.items.filter((i) => i.itemType === "ADD_ON")).toHaveLength(2);

    const done = await getDraft(t.org.id, draft.id);
    expect(done?.status).toBe("COMPLETED");
    expect(done?.orderId).toBe(order.id);
  });

  it("a meal added later starts empty and needs its own menu; once built it is a second entry of a Multi Order", async () => {
    const t = await setup();
    const { draft } = await completeDraft(t);
    const before = (await getDraft(t.org.id, draft.id))!.data;
    await saveDraftDetails(t.org.id, draft.id, { ...before, eventMealTypes: ["LUNCH", "DINNER", "LUNCH"] });
    const data = (await getDraft(t.org.id, draft.id))!.data;
    expect(data.eventMealTypes).toEqual(["LUNCH", "DINNER"]);
    expect(data.meals.LUNCH).toBeUndefined(); // new meal: nothing picked yet
    expect(allMealsComplete(data)).toBe(false);
    await expect(submitDraft(t.org.id, draft.id)).rejects.toThrow(/complete every step/);

    // Build lunch the same way as dinner: the totals add up and it is a Multi Order with one entry per meal.
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: t.menu.id }, "LUNCH");
    await saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.kebab.id, t.dal.id], addOnIds: [t.perPlateAddOn.id, t.fixedAddOn.id], mealType: "LUNCH" });
    const full = (await getDraft(t.org.id, draft.id))!.data;
    const quote = await buildDraftQuote(t.org.id, full);
    expect(quote.meals).toBe(2);
    expect(quote.menuAmount).toBe(500 * 60 * 2);
    expect(quote.total).toBe(2 * (30000 + 7200 + 600 + 1000) + 500); // the kids' charge is not repeated

    const result = await submitDraft(t.org.id, draft.id);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId }, include: { mealPlanEntries: true } });
    expect(order.orderKind).toBe("MULTI");
    expect(order.mealPlanEntries.map((m) => m.mealType).sort()).toEqual(["DINNER", "LUNCH"]);
    expect(Number(order.total)).toBe(quote.total);
  });

  it("needs at least one meal", async () => {
    const t = await setup();
    const { draft } = await completeDraft(t);
    const before = (await getDraft(t.org.id, draft.id))!.data;
    await expect(saveDraftDetails(t.org.id, draft.id, { ...before, eventMealTypes: [] })).rejects.toThrow(/at least one meal/);
  });

  it("a Single Order holds one meal; a Multi Order holds several (the Order Type chosen on the form)", async () => {
    const t = await setup();
    await expect(startDraft(t.org.id, t.details({ orderType: "SINGLE", eventMealTypes: ["LUNCH", "DINNER"] }))).rejects.toThrow(/Single Order has one date and one meal/);
    const single = await startDraft(t.org.id, t.details({ orderType: "SINGLE", eventMealTypes: ["DINNER"] }));
    expect((await getDraft(t.org.id, single.draft.id))!.data.eventMealTypes).toEqual(["DINNER"]);
    const multi = await startDraft(t.org.id, t.details({ orderType: "MULTI", eventMealTypes: ["LUNCH", "DINNER"], phone: "+919888877766", email: "multi@example.test" }));
    expect((await getDraft(t.org.id, multi.draft.id))!.data.eventMealTypes).toEqual(["LUNCH", "DINNER"]);
  });

  it("a date range is a Multi Order: the same meals every day, priced per day, booked as one entry per day (kids once)", async () => {
    const t = await setup();
    const start = futureDate();
    const end = futureDate(62); // three days
    await expect(startDraft(t.org.id, t.details({ orderType: "SINGLE", eventEndDate: end }))).rejects.toThrow(/one date and one meal/);
    await expect(startDraft(t.org.id, t.details({ eventEndDate: futureDate(58) }))).rejects.toThrow(/can't be before/);
    await expect(startDraft(t.org.id, t.details({ eventEndDate: futureDate(120) }))).rejects.toThrow(/up to 31 days/);

    const { draft } = await completeDraft(t, { orderType: "MULTI", eventEndDate: end });
    const data = (await getDraft(t.org.id, draft.id))!.data;
    expect(data.eventEndDate).toBe(end);
    const quote = await buildDraftQuote(t.org.id, data);
    expect(quote.days).toBe(3);
    expect(quote.menuAmount).toBe(500 * 60 * 3);
    expect(quote.extras).toEqual([expect.objectContaining({ name: "Veg Kebab", amount: 120 * 60 * 3 })]);
    expect(quote.addOns.map((a) => a.amount)).toEqual([10 * 60 * 3, 1000 * 3]);
    expect(quote.childrenCharge).toBe(2 * 250); // once, not per day
    expect(quote.total).toBe(3 * (30000 + 7200 + 600 + 1000) + 500);

    const submitted = await submitDraft(t.org.id, draft.id);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: submitted.orderId }, include: { mealPlanEntries: true } });
    expect(order.orderKind).toBe("MULTI");
    expect(order.eventStartDate.toISOString().slice(0, 10)).toBe(start);
    expect(order.eventEndDate.toISOString().slice(0, 10)).toBe(end);
    expect(order.mealPlanEntries).toHaveLength(3);
    expect(Number(order.total)).toBe(quote.total);
  });

  it("a second submit of the same draft is refused (no duplicate Order)", async () => {
    const t = await setup();
    const { draft } = await completeDraft(t);
    await submitDraft(t.org.id, draft.id);
    await expect(submitDraft(t.org.id, draft.id)).rejects.toThrow(/already been submitted/);
    expect(await prisma.order.count({ where: { organizationId: t.org.id } })).toBe(1);
  });

  it("refuses to submit before every step is done", async () => {
    const t = await setup();
    const { draft } = await startDraft(t.org.id, t.details());
    await expect(submitDraft(t.org.id, draft.id)).rejects.toThrow(/complete every step/);
  });

  it("Custom Menu: no prices shown or booked; the kitchen's per-plate quote then sets the Order total", async () => {
    const t = await setup();
    const { draft } = await startDraft(t.org.id, t.details({ child5To10Count: 0 }));
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "CUSTOM" });
    await saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.kebab.id, t.outsider.id], addOnIds: [] }); // no caps, any dish

    const result = await submitDraft(t.org.id, draft.id);
    expect(result.isCustomMenu).toBe(true);
    const before = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(Number(before.total)).toBe(0);
    const selection = await prisma.menuSelection.findUniqueOrThrow({ where: { id: result.menuSelectionId }, include: { items: true } });
    expect(selection.isCustomMenu).toBe(true);
    expect(selection.chosenMenuId).toBeNull();
    expect(selection.items.some((i) => i.isExtra)).toBe(false);

    await setCustomMenuPricePerPlate(t.org.id, selection.id, 400, t.actor.id);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(Number(after.total)).toBe(400 * 60);
    expect(Number((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).customPricePerPlate)).toBe(400);
  });
});

describe("several meals, each with its own menu (AJ, 2026-10-12)", () => {
  /** A second veg menu on the same Event Type, cheaper, with its own dishes. */
  async function secondMenu(t: Awaited<ReturnType<typeof setup>>) {
    const menu = await createMenu(t.org.id, { name: "Light Veg", menuType: "VEGETARIAN", pricePerPlate: 300 }, t.actor.id);
    const snacks = await createCategory(t.org.id, { name: "Snacks", menuAssignments: [{ menuId: menu.id, maxSelection: 1 }] }, t.actor.id);
    const samosa = await createMenuItem(t.org.id, { name: "Samosa", foodType: "VEGETARIAN", price: 40, menuIds: [menu.id], categoryIds: [snacks.id] }, t.actor.id);
    const pakora = await createMenuItem(t.org.id, { name: "Onion Pakora", foodType: "VEGETARIAN", price: 60, menuIds: [menu.id], categoryIds: [snacks.id] }, t.actor.id);
    await prisma.eventTypeMenu.create({ data: { eventTypeId: t.eventType.id, menuId: menu.id } });
    return { menu, samosa, pakora };
  }

  it("each meal saves its own menu, dishes and add-ons without touching the others", async () => {
    const t = await setup();
    const m2 = await secondMenu(t);
    const { draft } = await startDraft(t.org.id, t.details({ eventMealTypes: ["DINNER", "LUNCH"] }));

    // Canonical serving order, whatever order they were ticked in.
    expect((await getDraft(t.org.id, draft.id))!.data.eventMealTypes).toEqual(["LUNCH", "DINNER"]);

    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: m2.menu.id }, "LUNCH");
    await saveDraftItems(t.org.id, draft.id, { itemIds: [m2.samosa.id], mealType: "LUNCH" });
    await saveDraftAddOns(t.org.id, draft.id, [t.fixedAddOn.id], "LUNCH");
    // Dinner is not done yet: the review stays locked.
    expect((await getDraft(t.org.id, draft.id))!.currentStep).toBe(2);

    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: t.menu.id }, "DINNER");
    await saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.dal.id], mealType: "DINNER" });
    const saved = await saveDraftAddOns(t.org.id, draft.id, [t.perPlateAddOn.id], "DINNER");
    expect(saved.currentStep).toBe(3);

    const data = (await getDraft(t.org.id, draft.id))!.data;
    expect(data.meals.LUNCH).toMatchObject({ menuChoice: { kind: "MENU", menuId: m2.menu.id }, itemIds: [m2.samosa.id], addOnIds: [t.fixedAddOn.id] });
    expect(data.meals.DINNER).toMatchObject({ menuChoice: { kind: "MENU", menuId: t.menu.id }, itemIds: [t.tikka.id, t.dal.id], addOnIds: [t.perPlateAddOn.id] });
  });

  it("a dish from another meal's menu is refused for this meal, and a meal that was not asked for is refused", async () => {
    const t = await setup();
    const m2 = await secondMenu(t);
    const { draft } = await startDraft(t.org.id, t.details({ eventMealTypes: ["LUNCH", "DINNER"] }));
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: t.menu.id }, "DINNER");
    await expect(saveDraftItems(t.org.id, draft.id, { itemIds: [m2.samosa.id], mealType: "DINNER" })).rejects.toThrow(/isn't on the chosen menu/);
    await expect(saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: t.menu.id }, "BREAKFAST")).rejects.toThrow(/isn't part of your request/);
  });

  it("prices every meal on its own menu with one guest number; kids are charged once, on the first meal's menu", async () => {
    const t = await setup();
    const m2 = await secondMenu(t);
    const { draft } = await startDraft(t.org.id, t.details({ eventMealTypes: ["LUNCH", "DINNER"] }));
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: m2.menu.id }, "LUNCH");
    await saveDraftItems(t.org.id, draft.id, { itemIds: [m2.samosa.id, m2.pakora.id], mealType: "LUNCH" }); // one extra (cap 1): Onion Pakora
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: t.menu.id }, "DINNER");
    await saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.kebab.id, t.dal.id], addOnIds: [t.perPlateAddOn.id, t.fixedAddOn.id], mealType: "DINNER" });

    const quote = await buildDraftQuote(t.org.id, (await getDraft(t.org.id, draft.id))!.data);
    expect(quote.perMeal.map((m) => [m.mealType, m.menuName, m.menuAmount])).toEqual([["LUNCH", "Light Veg", 300 * 60], ["DINNER", "Classic Veg", 500 * 60]]);
    expect(quote.menuAmount).toBe(300 * 60 + 500 * 60);
    expect(quote.perMeal[0].extras).toEqual([expect.objectContaining({ name: "Onion Pakora", amount: 60 * 60 })]);
    expect(quote.perMeal[1].extras).toEqual([expect.objectContaining({ name: "Veg Kebab", amount: 120 * 60 })]);
    // The first meal's menu (Light Veg, no kids' rate) prices the kids: 0.
    expect(quote.childrenCharge).toBe(0);
    expect(quote.total).toBe(18000 + 3600 + 30000 + 7200 + 600 + 1000);
  });

  it("a meal still without a menu is left out of the running estimate, and submit refuses until every meal is done", async () => {
    const t = await setup();
    const { draft } = await startDraft(t.org.id, t.details({ eventMealTypes: ["LUNCH", "DINNER"] }));
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: t.menu.id }, "DINNER");
    await saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.dal.id], mealType: "DINNER" });
    const quote = await buildDraftQuote(t.org.id, (await getDraft(t.org.id, draft.id))!.data);
    expect(quote.meals).toBe(1);
    expect(quote.perMeal.map((m) => m.mealType)).toEqual(["DINNER"]);
    await expect(submitDraft(t.org.id, draft.id)).rejects.toThrow(/complete every step/);
  });

  it("submits a Multi Order with one meal-plan entry per meal, each on its own menu and price, at the quoted total", async () => {
    const t = await setup();
    const m2 = await secondMenu(t);
    const { draft } = await startDraft(t.org.id, t.details({ eventMealTypes: ["LUNCH", "DINNER"], child5To10Count: 0 }));
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: t.menu.id }, "LUNCH");
    await saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.dal.id], mealType: "LUNCH" });
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: m2.menu.id }, "DINNER");
    await saveDraftItems(t.org.id, draft.id, { itemIds: [m2.samosa.id], addOnIds: [t.fixedAddOn.id], mealType: "DINNER" });

    const quote = await buildDraftQuote(t.org.id, (await getDraft(t.org.id, draft.id))!.data);
    const result = await submitDraft(t.org.id, draft.id);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId }, include: { mealPlanEntries: { orderBy: { mealType: "asc" } } } });
    expect(order.orderKind).toBe("MULTI");
    expect(order.mealPlanEntries.map((m) => [m.mealType, m.menuId, Number(m.price)])).toEqual([
      ["LUNCH", t.menu.id, 500],
      ["DINNER", m2.menu.id, 300],
    ]);
    expect(Number(order.total)).toBe(quote.total);
    expect(quote.total).toBe(500 * 60 + 300 * 60 + 1000);

    // The flat selection rows mirror every meal's dishes (a menu per meal, the first one is "the chosen menu").
    const selection = await prisma.menuSelection.findUniqueOrThrow({ where: { id: result.menuSelectionId }, include: { items: true } });
    expect(selection.chosenMenuId).toBe(t.menu.id);
    expect(selection.items.map((i) => i.name).sort()).toEqual(["Dal Makhani", "Paneer Tikka", "Premium Crockery", "Samosa"]);
  });

  it("a Custom Menu meal next to a fixed-menu meal: the kitchen's quote prices only the custom one", async () => {
    const t = await setup();
    const { draft } = await startDraft(t.org.id, t.details({ eventMealTypes: ["LUNCH", "DINNER"], child5To10Count: 0 }));
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "CUSTOM" }, "LUNCH");
    await saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.kebab.id], mealType: "LUNCH" });
    await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: t.menu.id }, "DINNER");
    await saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.dal.id], mealType: "DINNER" });

    const result = await submitDraft(t.org.id, draft.id);
    expect(result.isCustomMenu).toBe(true);
    const selection = await prisma.menuSelection.findUniqueOrThrow({ where: { id: result.menuSelectionId } });
    expect(selection.chosenMenuId).toBe(t.menu.id);
    expect(Number((await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } })).total)).toBe(500 * 60); // the custom lunch is not priced yet

    await setCustomMenuPricePerPlate(t.org.id, selection.id, 400, t.actor.id);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId }, include: { mealPlanEntries: true } });
    expect(Number(after.total)).toBe(400 * 60 + 500 * 60);
    expect(after.mealPlanEntries.map((m) => [m.mealType, Number(m.price)]).sort()).toEqual([["DINNER", 500], ["LUNCH", 400]]);
  });

  it("changing the event type clears every meal's menu and dishes; changing the meals keeps the ones that stay", async () => {
    const t = await setup();
    const { draft } = await startDraft(t.org.id, t.details({ eventMealTypes: ["LUNCH", "DINNER"] }));
    for (const mealType of ["LUNCH", "DINNER"] as const) {
      await saveDraftMenuChoice(t.org.id, draft.id, { kind: "MENU", menuId: t.menu.id }, mealType);
      await saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.dal.id], mealType });
    }
    const before = (await getDraft(t.org.id, draft.id))!.data;
    await saveDraftDetails(t.org.id, draft.id, { ...before, eventMealTypes: ["DINNER", "BREAKFAST"] });
    const kept = (await getDraft(t.org.id, draft.id))!.data;
    expect(Object.keys(kept.meals)).toEqual(["DINNER"]);
    expect(kept.meals.DINNER?.itemIds).toEqual([t.tikka.id, t.dal.id]);

    const other = await createEventType(t.org.id, { name: "Birthday", menuIds: [t.menu.id] }, t.actor.id);
    await saveDraftDetails(t.org.id, draft.id, { ...kept, eventTypeId: other.id });
    expect((await getDraft(t.org.id, draft.id))!.data.meals.DINNER?.menuChoice).toBeUndefined();
  });

  it("a draft saved before per-meal menus keeps working: its one set of picks stands for every meal", async () => {
    const t = await setup();
    const { draft } = await startDraft(t.org.id, t.details({ eventMealTypes: ["LUNCH", "DINNER"] }));
    const data = (await getDraft(t.org.id, draft.id))!.data as unknown as Record<string, unknown>;
    delete data.meals;
    await prisma.storefrontDraft.update({
      where: { id: draft.id },
      data: { data: { ...data, menuChoice: { kind: "MENU", menuId: t.menu.id }, itemIds: [t.tikka.id, t.dal.id], addOnIds: [t.fixedAddOn.id] } as never },
    });
    const migrated = (await getDraft(t.org.id, draft.id))!.data;
    expect(migrated.meals.LUNCH).toEqual(migrated.meals.DINNER);
    expect(migrated.meals.LUNCH).toMatchObject({ menuChoice: { kind: "MENU", menuId: t.menu.id }, itemIds: [t.tikka.id, t.dal.id], addOnIds: [t.fixedAddOn.id] });
    const quote = await buildDraftQuote(t.org.id, migrated);
    expect(quote.meals).toBe(2);
    expect(quote.menuAmount).toBe(500 * 60 * 2);
  });
});

describe("abandoned orders (30-minute idle, 30-day expiry, 90-day purge)", () => {
  it("lists an idle draft as abandoned and a fresh one as in progress", async () => {
    const t = await setup();
    const idle = await startDraft(t.org.id, t.details({ phone: "9111111111" }));
    await startDraft(t.org.id, t.details({ phone: "9222222222" }));
    await prisma.storefrontDraft.update({ where: { id: idle.draft.id }, data: { lastActivityAt: new Date(Date.now() - 31 * 60 * 1000) } });

    const abandoned = await listAbandonedOrders(t.org.id, "ABANDONED");
    expect(abandoned.map((d) => d.id)).toEqual([idle.draft.id]);
    expect(abandoned[0].isAbandoned).toBe(true);
    expect(abandoned[0].isExpired).toBe(false);
    expect(abandoned[0].eventTypeName).toBe("Wedding");

    expect((await listAbandonedOrders(t.org.id, "ACTIVE")).map((d) => d.isAbandoned)).toEqual([false]);
    expect(await listAbandonedOrders(t.org.id, "ALL")).toHaveLength(2);
  });

  it("a submitted draft never appears, and a 31-day-old one is marked expired without being deleted", async () => {
    const t = await setup();
    const old = await startDraft(t.org.id, t.details({ phone: "9333333333" }));
    await prisma.storefrontDraft.update({ where: { id: old.draft.id }, data: { lastActivityAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) } });

    const all = await listAbandonedOrders(t.org.id, "ALL");
    expect(all).toHaveLength(1);
    expect(all[0].isExpired).toBe(true);
    expect(await prisma.storefrontDraft.count({ where: { id: old.draft.id } })).toBe(1); // kept, not purged
    const lead = await prisma.customer.findUniqueOrThrow({ where: { id: old.customer.id }, include: { _count: { select: { orders: true } } } });
    expect(lead._count.orders).toBe(0); // still a Lead with 0 orders
  });

  it("a 91-day-old draft is purged on the next read, while the Lead stays", async () => {
    const t = await setup();
    const ancient = await startDraft(t.org.id, t.details({ phone: "9444444444" }));
    await prisma.storefrontDraft.update({ where: { id: ancient.draft.id }, data: { lastActivityAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000) } });

    expect(await listAbandonedOrders(t.org.id, "ALL")).toHaveLength(0);
    expect(await prisma.storefrontDraft.count({ where: { id: ancient.draft.id } })).toBe(0);
    const lead = await prisma.customer.findUniqueOrThrow({ where: { id: ancient.customer.id }, include: { _count: { select: { orders: true } } } });
    expect(lead._count.orders).toBe(0); // still a Lead with 0 orders
  });
});
