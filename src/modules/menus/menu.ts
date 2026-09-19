import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
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
}

export async function createMenu(organizationId: string, input: MenuInput, actorUserId: string) {
  const menu = await prisma.menu.create({
    data: {
      organizationId,
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
    orderBy: { createdAt: "desc" },
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
}

export interface StorefrontMenuSection {
  categoryId: string | null;
  categoryName: string;
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

function toStorefrontItem(item: { id: string; name: string; description: string | null; image: string | null; foodType: FoodType; price: unknown }): StorefrontMenuItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    image: item.image,
    foodType: item.foodType,
    price: Number(item.price),
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
    orderBy: { createdAt: "desc" },
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
          items: categoryItems.map(toStorefrontItem),
        };
      })
      .filter((section) => section.items.length > 0);

    const uncategorized = menu.items.filter((mi) => !categorizedItemIds.has(mi.menuItemId)).map((mi) => mi.menuItem);
    if (uncategorized.length > 0) {
      sections.push({ categoryId: null, categoryName: "Other Items", items: uncategorized.map(toStorefrontItem) });
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
  items: { id: string; name: string; price: number }[];
}

export interface OrderPickerMenu {
  id: string;
  name: string;
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
        items: categoryItems.map((item) => ({ id: item.id, name: item.name, price: Number(item.price) })),
      };
    })
    .filter((section) => section.items.length > 0);

  const uncategorized = menu.items.filter((mi) => !categorizedItemIds.has(mi.menuItemId)).map((mi) => mi.menuItem);
  if (uncategorized.length > 0) {
    sections.push({
      categoryId: null,
      categoryName: "Other Items",
      maxSelection: null,
      items: uncategorized.map((item) => ({ id: item.id, name: item.name, price: Number(item.price) })),
    });
  }

  return { id: menu.id, name: menu.name, sections };
}
