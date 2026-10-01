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
    expect((await getDraft(t.org.id, draft.id))!.data.addOnIds).toEqual([t.perPlateAddOn.id]); // repeats collapse

    // None at all is fine, and saving the dishes again keeps the chosen add-ons.
    await saveDraftAddOns(t.org.id, draft.id, []);
    await saveDraftAddOns(t.org.id, draft.id, [t.fixedAddOn.id]);
    await saveDraftItems(t.org.id, draft.id, { itemIds: [t.tikka.id, t.dal.id] });
    expect((await getDraft(t.org.id, draft.id))!.data.addOnIds).toEqual([t.fixedAddOn.id]);
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
    // "Number of Guests" is the adults; the two 5-10 kids sit on top.
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

  it("several meals repeat the menu, extras and add-ons for each, as a Multi Order with one entry per meal", async () => {
    const t = await setup();
    const { draft } = await completeDraft(t);
    const before = (await getDraft(t.org.id, draft.id))!.data;
    await saveDraftDetails(t.org.id, draft.id, { ...before, eventMealTypes: ["LUNCH", "DINNER", "LUNCH"] });
    const data = (await getDraft(t.org.id, draft.id))!.data;
    expect(data.eventMealTypes).toEqual(["LUNCH", "DINNER"]);

    const quote = await buildDraftQuote(t.org.id, data);
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
