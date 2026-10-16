import "server-only";
import { prisma } from "@/lib/db";
import { menuGuestCount, priceMeals } from "@/modules/orders/meal-pricing";
import { parseCustomCharges, resolveCustomCharges } from "@/modules/orders/custom-charges";
import type { ApprovalSnapshot } from "@/modules/menu-approvals/approval-snapshot";
import type { getQuotation } from "./quotation";

type QuotationWithDetails = NonNullable<Awaited<ReturnType<typeof getQuotation>>>;

/**
 * A quotation in the shape the customer's menu-review page draws (the same ApprovalSnapshot an order's menu approval uses), so the
 * quotation page and the Review & Approve page look and total the same (AJ, 2026-10-17). Built live, not frozen: a quotation's
 * price is final once it is sent and nothing here is stored.
 */
export async function buildQuotationSnapshot(organizationId: string, quotation: QuotationWithDetails): Promise<ApprovalSnapshot> {
  const allItems = quotation.mealPlanEntries.flatMap((entry) => entry.items);
  const dishIds = [...new Set(allItems.map((item) => item.menuItemId).filter((id): id is string => !!id))];
  const addOnIds = [...new Set(allItems.map((item) => item.addOnId).filter((id): id is string => !!id))];
  const [dishCategories, addOns] = await Promise.all([
    dishIds.length > 0 ? prisma.menuItemCategory.findMany({ where: { menuItemId: { in: dishIds } }, select: { menuItemId: true, category: { select: { name: true } } }, orderBy: { createdAt: "asc" } }) : [],
    addOnIds.length > 0 ? prisma.addOn.findMany({ where: { id: { in: addOnIds }, organizationId }, select: { id: true, type: true, priceType: true, includedInPackage: true } }) : [],
  ]);
  const categoryOfDish = new Map<string, string>();
  for (const row of dishCategories) if (!categoryOfDish.has(row.menuItemId)) categoryOfDish.set(row.menuItemId, row.category.name);
  const addOnById = new Map(addOns.map((addOn) => [addOn.id, addOn]));

  const pricing = priceMeals(
    quotation.mealPlanEntries.map((entry) => ({
      price: entry.price === null ? null : Number(entry.price),
      menuPricePerPlate: entry.menu ? Number(entry.menu.pricePerPlate) : null,
      items: entry.items.map((item) => ({ itemType: item.itemType, unitPrice: Number(item.unitPrice), quantity: item.quantity, isExtra: item.isExtra })),
    })),
    quotation.individualPricingEnabled,
    menuGuestCount(quotation),
  );
  let extrasAmount = 0;
  let liveCountersAmount = 0;
  let addOnsAmount = 0;
  for (const item of allItems) {
    const amount = Number(item.unitPrice) * item.quantity;
    if (item.itemType === "ADD_ON") {
      if (item.addOnId && addOnById.get(item.addOnId)?.type === "LIVE_COUNTER") liveCountersAmount += amount;
      else addOnsAmount += amount;
    } else if (item.isExtra) extrasAmount += amount;
  }
  const childrenCharge = Number(quotation.childrenCharge);
  const total = Number(quotation.total);
  const customCharges = resolveCustomCharges(parseCustomCharges(quotation.customCharges), Number(quotation.subtotal)).map((c) => ({ label: c.label, amount: c.amount }));
  const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "");

  return {
    customerName: quotation.customer.name,
    eventTypeName: quotation.eventType?.name ?? null,
    eventStartDate: day(quotation.eventStartDate),
    eventEndDate: day(quotation.eventEndDate ?? quotation.eventStartDate),
    venue: quotation.venue ?? quotation.eventAddress ?? null,
    guests: quotation.totalParticipants,
    total,
    meals: quotation.mealPlanEntries.map((entry) => ({
      date: day(entry.date),
      mealType: entry.mealType,
      menuName: entry.menu?.name ?? null,
      menuId: entry.menuId,
      price: entry.price === null ? null : Number(entry.price),
      menuImage: entry.menu?.image ?? null,
      menuDescription: entry.menu?.description ?? null,
      pricePerPlate: entry.menu ? Number(entry.menu.pricePerPlate) : null,
      items: entry.items.map((item) => {
        const addOn = item.addOnId ? addOnById.get(item.addOnId) : undefined;
        return {
          name: item.name,
          quantity: item.quantity,
          itemType: item.itemType,
          catalogId: item.menuItemId ?? item.addOnId ?? item.menuId ?? undefined,
          unitPrice: Number(item.unitPrice),
          isExtra: item.isExtra,
          category: item.menuItemId ? (categoryOfDish.get(item.menuItemId) ?? null) : null,
          ...(addOn ? { addOnType: addOn.type, priceType: addOn.priceType, included: addOn.includedInPackage } : {}),
        };
      }),
    })),
    selectedItems: quotation.items.map((item) => ({ name: item.name, isExtra: false })),
    isCustomMenu: false,
    breakdown: {
      menuAmount: pricing.menuAmount,
      extrasAmount,
      liveCountersAmount,
      addOnsAmount,
      childrenCharge,
      adjustments: total - (pricing.menuAmount + extrasAmount + liveCountersAmount + addOnsAmount + childrenCharge),
      transportation: Number(quotation.transportationCost),
      otherCharges: Number(quotation.otherCharges),
      customCharges,
      discount: Number(quotation.discount),
    },
    childBelow5Count: quotation.childBelow5Count ?? 0,
    child5To10Count: quotation.child5To10Count ?? 0,
    adultCount: quotation.adultCount ?? 0,
  };
}
