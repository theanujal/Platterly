import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { listAddOns } from "@/modules/addons/addon";
import type { FoodType, ChildPricingType } from "@/generated/prisma/enums";

export interface MenuInput {
  name: string;
  description?: string;
  image?: string;
  menuType: FoodType;
  pricePerPlate: number;
  isActive?: boolean;
  childUnder5Chargeable?: boolean;
  childUnder5Price?: number | null;
  child5To10PricingType?: ChildPricingType;
  child5To10PriceValue?: number | null;
  /** Full replacement of this menu's categories, in display order, each with its max-selection (null = unlimited). Omit to leave them alone. */
  categoryAssignments?: { categoryId: string; maxSelection: number | null }[];
}

/** The Menu Types drawer owns picking and ordering a menu's categories (AJ, 2026-09-30); the array order becomes each row's sortOrder. */
async function replaceMenuCategoryAssignments(organizationId: string, menuId: string, assignments: MenuInput["categoryAssignments"]) {
  if (assignments === undefined) return;
  const valid = await prisma.menuCategory.findMany({
    where: { organizationId, id: { in: assignments.map((a) => a.categoryId) } },
    select: { id: true },
  });
  const validIds = new Set(valid.map((c) => c.id));
  const rows = assignments.filter((a) => validIds.has(a.categoryId));
  await prisma.menuCategoryAssignment.deleteMany({ where: { menuId } });
  if (rows.length === 0) return;
  await prisma.menuCategoryAssignment.createMany({
    data: rows.map((a, index) => ({ menuId, categoryId: a.categoryId, maxSelection: a.maxSelection, sortOrder: index })),
  });
}

/** A new Menu goes to the end of the display order (same convention as Event Types). */
async function nextMenuSortOrder(organizationId: string): Promise<number> {
  const { _max } = await prisma.menu.aggregate({ where: { organizationId }, _max: { sortOrder: true } });
  return _max.sortOrder != null ? _max.sortOrder + 1 : 0;
}

/**
 * Shuffle the order Menus appear in — on the public storefront and in Menu Types (AJ, 2026-10-01). Move up / down
 * only, no drag, like Event Types. `orderedIds` must be exactly this tenant's Menus.
 */
export async function reorderMenus(organizationId: string, orderedIds: string[], actorUserId: string) {
  const existing = await prisma.menu.findMany({ where: { organizationId }, select: { id: true } });
  const existingIds = new Set(existing.map((m) => m.id));
  if (existingIds.size !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !existingIds.has(id))) {
    throw new Error("orderedIds must exactly match the tenant's current Menus.");
  }

  await prisma.$transaction(orderedIds.map((id, index) => prisma.menu.update({ where: { id }, data: { sortOrder: index } })));

  await audit({ organizationId, actorUserId, action: "menu.reorder", recordType: "Menu", recordId: organizationId, after: { orderedIds } });
}

export async function createMenu(organizationId: string, input: MenuInput, actorUserId: string) {
  const menu = await prisma.menu.create({
    data: {
      organizationId,
      sortOrder: await nextMenuSortOrder(organizationId),
      name: input.name,
      description: input.description,
      image: input.image,
      menuType: input.menuType,
      pricePerPlate: input.pricePerPlate,
      isActive: input.isActive ?? true,
      childUnder5Chargeable: input.childUnder5Chargeable ?? false,
      childUnder5Price: input.childUnder5Price,
      child5To10PricingType: input.child5To10PricingType ?? "FIXED",
      child5To10PriceValue: input.child5To10PriceValue,
    },
  });

  await replaceMenuCategoryAssignments(organizationId, menu.id, input.categoryAssignments);

  await audit({
    organizationId,
    actorUserId,
    action: "menu.create",
    recordType: "Menu",
    recordId: menu.id,
    after: JSON.parse(JSON.stringify(menu)),
  });

  return menu;
}

export async function updateMenu(organizationId: string, id: string, input: MenuInput, actorUserId: string) {
  const before = await prisma.menu.findFirstOrThrow({ where: { id, organizationId } });

  const after = await prisma.menu.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      image: input.image,
      menuType: input.menuType,
      pricePerPlate: input.pricePerPlate,
      isActive: input.isActive ?? before.isActive,
      childUnder5Chargeable: input.childUnder5Chargeable ?? before.childUnder5Chargeable,
      childUnder5Price: input.childUnder5Price !== undefined ? input.childUnder5Price : before.childUnder5Price,
      child5To10PricingType: input.child5To10PricingType ?? before.child5To10PricingType,
      child5To10PriceValue: input.child5To10PriceValue !== undefined ? input.child5To10PriceValue : before.child5To10PriceValue,
    },
  });

  await replaceMenuCategoryAssignments(organizationId, id, input.categoryAssignments);

  await audit({
    organizationId,
    actorUserId,
    action: "menu.update",
    recordType: "Menu",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });

  return after;
}

export async function deleteMenu(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.menu.findFirstOrThrow({ where: { id, organizationId } });
  await prisma.menu.delete({ where: { id } });

  await audit({
    organizationId,
    actorUserId,
    action: "menu.delete",
    recordType: "Menu",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

/**
 * Reorders (never adds/removes) a Menu's already-assigned categories —
 * assignment itself is owned by category.ts's `replaceCategoryMenuAssignments`
 * now (2026-09-14, AJ). `orderedCategoryIds` must exactly match the menu's
 * current assignment set; one audit row for the whole batch.
 */
export async function reorderMenuCategoryAssignments(
  organizationId: string,
  menuId: string,
  orderedCategoryIds: string[],
  actorUserId: string,
) {
  await prisma.menu.findFirstOrThrow({ where: { id: menuId, organizationId } });

  const existing = await prisma.menuCategoryAssignment.findMany({
    where: { menuId, categoryId: { in: orderedCategoryIds } },
    select: { id: true, categoryId: true, sortOrder: true },
  });
  if (existing.length !== orderedCategoryIds.length) {
    throw new Error("One or more categories are not currently assigned to this menu.");
  }
  const byCategory = new Map(existing.map((a) => [a.categoryId, a]));

  await prisma.$transaction(
    orderedCategoryIds.map((categoryId, index) =>
      prisma.menuCategoryAssignment.update({
        where: { id: byCategory.get(categoryId)!.id },
        data: { sortOrder: index },
      }),
    ),
  );

  await audit({
    organizationId,
    actorUserId,
    action: "menu.reorder_categories",
    recordType: "Menu",
    recordId: menuId,
    before: JSON.parse(JSON.stringify(existing)),
    after: JSON.parse(JSON.stringify(orderedCategoryIds.map((categoryId, index) => ({ categoryId, sortOrder: index })))),
  });
}

export async function listMenus(organizationId: string) {
  return prisma.menu.findMany({
    where: { organizationId },
    // Scalar-only — menus/page.tsx resolves each categoryId to a name via
    // the `categories` list it already fetches, same pattern as before.
    include: { categoryAssignments: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
}

export async function getMenu(organizationId: string, id: string) {
  return prisma.menu.findFirst({
    where: { id, organizationId },
    include: {
      items: { include: { menuItem: true }, orderBy: { sortOrder: "asc" } },
      categoryAssignments: { include: { category: true }, orderBy: { sortOrder: "asc" } },
    },
  });
}

export interface StorefrontMenuItem {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  foodType: FoodType;
  price: number;
  /** The caterer's highlight tags, shown as badges. */
  highlights: { popular: boolean; chefsSpecial: boolean; liveCounter: boolean };
  /** Food Item "Additional Details", pre-formatted as label/value rows — only the ones the caterer filled in (a blank one never renders). */
  details: { label: string; value: string }[];
}

export interface StorefrontMenuSection {
  categoryId: string | null;
  categoryName: string;
  /** MenuCategoryAssignment.maxSelection — null means uncapped (Other Items, or a Custom Menu). */
  maxSelection: number | null;
  items: StorefrontMenuItem[];
}

export interface StorefrontMenu {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  menuType: FoodType;
  pricePerPlate: number;
  sections: StorefrontMenuSection[];
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

type StorefrontItemSource = {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  foodType: FoodType;
  price: unknown;
  isPopular: boolean;
  isChefsSpecial: boolean;
  isLiveCounter: boolean;
  origin: string | null;
  baseType: string | null;
  preparationMethod: string | null;
  spiceLevel: string | null;
  onionGarlic: string | null;
  vegFriendly: boolean | null;
  nonVegFriendly: boolean | null;
  texture: string | null;
  tasteProfile: string | null;
  keyIngredients: string | null;
};

function buildItemDetailRows(item: StorefrontItemSource): { label: string; value: string }[] {
  const rows: { label: string; value: string | null }[] = [
    { label: "Origin", value: item.origin ? humanize(item.origin) : null },
    { label: "Base", value: item.baseType ? humanize(item.baseType) : null },
    { label: "Preparation", value: item.preparationMethod ? humanize(item.preparationMethod) : null },
    { label: "Spice Level", value: item.spiceLevel ? humanize(item.spiceLevel) : null },
    { label: "Onion / Garlic", value: item.onionGarlic ? (item.onionGarlic === "WITH_ONION_GARLIC" ? "With onion & garlic" : "Without onion & garlic") : null },
    {
      label: "Also Suits",
      value: [item.vegFriendly ? "Veg guests" : null, item.nonVegFriendly ? "Non-veg guests" : null].filter(Boolean).join(" & ") || null,
    },
    { label: "Texture", value: item.texture ? humanize(item.texture) : null },
    { label: "Taste", value: item.tasteProfile ? humanize(item.tasteProfile) : null },
    { label: "Key Ingredients", value: item.keyIngredients?.trim() || null },
  ];
  return rows.filter((row): row is { label: string; value: string } => row.value !== null);
}

function toStorefrontItem(item: StorefrontItemSource): StorefrontMenuItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    image: item.image,
    foodType: item.foodType,
    price: Number(item.price),
    highlights: { popular: item.isPopular, chefsSpecial: item.isChefsSpecial, liveCounter: item.isLiveCounter },
    details: buildItemDetailRows(item),
  };
}

export interface StorefrontMenuFilter {
  /** Chunk 11 Group 11.2 — scope to Menus assigned to the customer's chosen Event Type (EventTypeMenu). */
  eventTypeId?: string;
  menuType?: FoodType;
}

/**
 * Chunk 8 Group 8.3 — active Menus with their active items, grouped into
 * sections by the menu's own category assignments (items tagged with an
 * assigned category land in that section; anything else falls into a
 * trailing "Other Items" section). View-only itself: no `maxSelection`
 * semantics here, but Chunk 11's Menu Selection reuses it with `filter`
 * scoped to the customer's Event Type/Menu Preference.
 */
export async function listStorefrontMenus(organizationId: string, filter?: StorefrontMenuFilter): Promise<StorefrontMenu[]> {
  const menus = await prisma.menu.findMany({
    where: {
      organizationId,
      isActive: true,
      ...(filter?.eventTypeId ? { eventTypes: { some: { eventTypeId: filter.eventTypeId } } } : {}),
      ...(filter?.menuType ? { menuType: filter.menuType } : {}),
    },
    include: {
      items: {
        where: { menuItem: { isActive: true } },
        include: { menuItem: { include: { categories: { select: { categoryId: true } } } } },
        orderBy: { sortOrder: "asc" },
      },
      categoryAssignments: {
        where: { category: { isActive: true } },
        include: { category: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return menus.map((menu) => {
    const categorizedItemIds = new Set<string>();

    const sections: StorefrontMenuSection[] = menu.categoryAssignments
      .map((assignment) => {
        const categoryItems = menu.items
          .filter((mi) => mi.menuItem.categories.some((c) => c.categoryId === assignment.categoryId))
          .map((mi) => mi.menuItem);
        categoryItems.forEach((item) => categorizedItemIds.add(item.id));
        return {
          categoryId: assignment.categoryId,
          categoryName: assignment.category.name,
          maxSelection: assignment.maxSelection,
          items: categoryItems.map(toStorefrontItem),
        };
      })
      .filter((section) => section.items.length > 0);

    const uncategorized = menu.items.filter((mi) => !categorizedItemIds.has(mi.menuItemId)).map((mi) => mi.menuItem);
    if (uncategorized.length > 0) {
      sections.push({ categoryId: null, categoryName: "Other Items", maxSelection: null, items: uncategorized.map(toStorefrontItem) });
    }

    return {
      id: menu.id,
      name: menu.name,
      description: menu.description,
      image: menu.image,
      menuType: menu.menuType,
      pricePerPlate: Number(menu.pricePerPlate),
      sections,
    };
  });
}

export interface OrderPickerSection {
  categoryId: string | null;
  categoryName: string;
  /** MenuCategoryAssignment.maxSelection — null means no cap for this category on this Menu. */
  maxSelection: number | null;
  items: OrderPickerItem[];
}

export interface OrderPickerItem {
  id: string;
  name: string;
  price: number;
  image: string | null;
  foodType: FoodType;
}

export interface OrderPickerMenu {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  sections: OrderPickerSection[];
}

/**
 * Create Order redesign (2026-09-20) — the "Select Food Items" dialog's data
 * source for one specific Menu, fetched on demand once a meal assigns that
 * Menu (rather than preloading every Menu's items up front for every Order
 * form load). Same category-grouping shape as `listStorefrontMenus` (items
 * bucketed by the Menu's own categoryAssignments, anything uncategorized
 * trailing under "Other Items"), but scoped to one Menu and additionally
 * carrying each section's `maxSelection` — `listStorefrontMenus` drops that
 * because the public storefront never needs to cap selection, but the
 * reference "0/2" cap in the admin picker does.
 */
function toPickerItem(item: { id: string; name: string; price: unknown; image: string | null; foodType: FoodType }): OrderPickerItem {
  return { id: item.id, name: item.name, price: Number(item.price), image: item.image, foodType: item.foodType };
}

export async function getMenuForOrderPicker(organizationId: string, menuId: string): Promise<OrderPickerMenu | null> {
  const menu = await prisma.menu.findFirst({
    where: { id: menuId, organizationId },
    include: {
      items: {
        where: { menuItem: { isActive: true } },
        include: { menuItem: { include: { categories: { select: { categoryId: true } } } } },
        orderBy: { sortOrder: "asc" },
      },
      categoryAssignments: {
        where: { category: { isActive: true } },
        include: { category: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!menu) return null;

  const categorizedItemIds = new Set<string>();
  const sections: OrderPickerSection[] = menu.categoryAssignments
    .map((assignment) => {
      const categoryItems = menu.items
        .filter((mi) => mi.menuItem.categories.some((c) => c.categoryId === assignment.categoryId))
        .map((mi) => mi.menuItem);
      categoryItems.forEach((item) => categorizedItemIds.add(item.id));
      return {
        categoryId: assignment.categoryId,
        categoryName: assignment.category.name,
        maxSelection: assignment.maxSelection,
        items: categoryItems.map(toPickerItem),
      };
    })
    .filter((section) => section.items.length > 0);

  const uncategorized = menu.items.filter((mi) => !categorizedItemIds.has(mi.menuItemId)).map((mi) => mi.menuItem);
  if (uncategorized.length > 0) {
    sections.push({
      categoryId: null,
      categoryName: "Other Items",
      maxSelection: null,
      items: uncategorized.map(toPickerItem),
    });
  }

  return { id: menu.id, name: menu.name, description: menu.description, image: menu.image, sections };
}

export interface MenuPickerAddOn {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  price: number;
  priceType: "PER_PLATE" | "FIXED";
}

/** The food-item-selection drawer's data: the Menu's category-grouped items plus the active Add-ons. */
export type MenuPickerData = OrderPickerMenu & { addOns: MenuPickerAddOn[] };

/**
 * Item-picker parity with Order (2026-09-28) — the shared data source behind
 * the drawer, regardless of which feature (Order, Quotation) opened it.
 * Lifted out of orders/actions.ts's `getMenuForOrderPickerAction`, which
 * duplicated this exact addOn-combining logic; each feature's own action
 * wrapper applies its own `requirePermission` check before calling this, so
 * the permission boundary stays per-feature even though the fetch is shared.
 */
export async function getMenuPickerData(organizationId: string, menuId: string): Promise<MenuPickerData | null> {
  const [menu, addOns] = await Promise.all([getMenuForOrderPicker(organizationId, menuId), listAddOns(organizationId)]);
  if (!menu) return null;
  return {
    ...menu,
    addOns: addOns
      .filter((a) => a.isActive)
      .map((a) => ({ id: a.id, name: a.name, description: a.description, image: a.image, price: Number(a.price), priceType: a.priceType })),
  };
}

/**
 * Chunk 12 — the storefront's Custom Menu path: no Menu, no caps, no prices
 * shown; the customer hand-picks any active dish (a Vegetarian preference
 * only sees veg dishes; Non-Vegetarian sees everything), grouped by each
 * dish's first category. The kitchen quotes the per-plate price afterwards.
 */
export async function listCustomMenuSections(organizationId: string, menuPreference: FoodType): Promise<StorefrontMenuSection[]> {
  const items = await prisma.menuItem.findMany({
    where: { organizationId, isActive: true, ...(menuPreference === "VEGETARIAN" ? { foodType: "VEGETARIAN" } : {}) },
    include: { categories: { include: { category: true } } },
    orderBy: { name: "asc" },
  });

  const sections = new Map<string, StorefrontMenuSection>();
  for (const item of items) {
    const category = item.categories.map((c) => c.category).find((c) => c.isActive);
    const key = category?.id ?? "other";
    if (!sections.has(key)) {
      sections.set(key, { categoryId: category?.id ?? null, categoryName: category?.name ?? "Other Items", maxSelection: null, items: [] });
    }
    sections.get(key)!.items.push(toStorefrontItem(item));
  }
  return [...sections.values()].sort((a, b) => (a.categoryId === null ? 1 : 0) - (b.categoryId === null ? 1 : 0));
}

/** Copies a Menu with its items and category assignments (AJ, 2026-09-30 — the card menu's Duplicate). */
export async function duplicateMenu(organizationId: string, id: string, actorUserId: string) {
  const source = await getMenu(organizationId, id);
  if (!source) throw new Error("Menu not found.");

  const copy = await prisma.menu.create({
    data: {
      organizationId,
      sortOrder: await nextMenuSortOrder(organizationId),
      name: `${source.name} (Copy)`,
      description: source.description,
      image: source.image,
      menuType: source.menuType,
      pricePerPlate: source.pricePerPlate,
      isActive: source.isActive,
      childUnder5Chargeable: source.childUnder5Chargeable,
      childUnder5Price: source.childUnder5Price,
      child5To10PricingType: source.child5To10PricingType,
      child5To10PriceValue: source.child5To10PriceValue,
    },
  });
  if (source.items.length > 0) {
    await prisma.menuMenuItem.createMany({ data: source.items.map((i) => ({ menuId: copy.id, menuItemId: i.menuItemId, sortOrder: i.sortOrder })) });
  }
  if (source.categoryAssignments.length > 0) {
    await prisma.menuCategoryAssignment.createMany({
      data: source.categoryAssignments.map((a) => ({ menuId: copy.id, categoryId: a.categoryId, maxSelection: a.maxSelection, sortOrder: a.sortOrder })),
    });
  }

  await audit({ organizationId, actorUserId, action: "menu.create", recordType: "Menu", recordId: copy.id, after: JSON.parse(JSON.stringify(copy)) });
  return copy;
}

export async function setMenuActive(organizationId: string, id: string, isActive: boolean, actorUserId: string) {
  const before = await prisma.menu.findFirstOrThrow({ where: { id, organizationId } });
  const after = await prisma.menu.update({ where: { id }, data: { isActive } });
  await audit({
    organizationId,
    actorUserId,
    action: "menu.update",
    recordType: "Menu",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });
}
