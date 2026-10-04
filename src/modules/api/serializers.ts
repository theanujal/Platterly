/**
 * Chunk 25 — what the public API says about a record. Every response is built here, field by field, from a query that
 * only selected these fields, so nothing internal (organization ids, kitchen notes, stock bookkeeping, who did what)
 * can leak just because a column was added later. Names are snake_case, money is a number in rupees, dates are
 * YYYY-MM-DD for calendar days and ISO 8601 for moments.
 */
const day = (d: Date) => d.toISOString().slice(0, 10);
const money = (d: unknown) => Number(d);
const moneyOrNull = (d: unknown) => (d === null || d === undefined ? null : Number(d));

export const customerDto = (c: { id: string; name: string; phone: string; email: string | null; isActive: boolean; leadSource: string | null; createdAt: Date; updatedAt: Date; _count: { orders: number } }) => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  email: c.email,
  status: c._count.orders > 0 ? "CUSTOMER" : "LEAD",
  is_active: c.isActive,
  lead_source: c.leadSource,
  order_count: c._count.orders,
  created_at: c.createdAt.toISOString(),
  updated_at: c.updatedAt.toISOString(),
});

export const menuDto = (m: {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  menuType: string;
  pricePerPlate: unknown;
  isActive: boolean;
  childUnder5Chargeable: boolean;
  childUnder5Price: unknown;
  child5To10PricingType: string;
  child5To10PriceValue: unknown;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: m.id,
  name: m.name,
  description: m.description,
  image: m.image,
  menu_type: m.menuType,
  price_per_plate: money(m.pricePerPlate),
  is_active: m.isActive,
  children: {
    under_5_chargeable: m.childUnder5Chargeable,
    under_5_price: moneyOrNull(m.childUnder5Price),
    from_5_to_10_pricing_type: m.child5To10PricingType,
    from_5_to_10_value: moneyOrNull(m.child5To10PriceValue),
  },
  created_at: m.createdAt.toISOString(),
  updated_at: m.updatedAt.toISOString(),
});

export const menuItemDto = (i: { id: string; name: string; description: string | null; image: string | null; foodType: string; price: unknown; isActive: boolean; isPopular: boolean; isChefsSpecial: boolean; isLiveCounter: boolean; createdAt: Date; updatedAt: Date }) => ({
  id: i.id,
  name: i.name,
  description: i.description,
  image: i.image,
  food_type: i.foodType,
  price: money(i.price),
  is_active: i.isActive,
  is_popular: i.isPopular,
  is_chefs_special: i.isChefsSpecial,
  is_live_counter: i.isLiveCounter,
  created_at: i.createdAt.toISOString(),
  updated_at: i.updatedAt.toISOString(),
});

export const addOnDto = (a: { id: string; name: string; description: string | null; image: string | null; type: string; priceType: string; price: unknown; includedInPackage: boolean; isActive: boolean; createdAt: Date; updatedAt: Date }) => ({
  id: a.id,
  name: a.name,
  description: a.description,
  image: a.image,
  type: a.type,
  price_type: a.priceType,
  price: money(a.price),
  included_in_package: a.includedInPackage,
  is_active: a.isActive,
  created_at: a.createdAt.toISOString(),
  updated_at: a.updatedAt.toISOString(),
});

export const eventDto = (e: {
  id: string;
  name: string;
  status: string;
  startDate: Date;
  endDate: Date;
  venue: string | null;
  guestCount: number | null;
  orderId: string | null;
  customerId: string;
  eventTypeId: string;
  assignedKitchenId: string | null;
  createdAt: Date;
  updatedAt: Date;
  eventType: { name: string };
  assignedKitchen: { name: string } | null;
}) => ({
  id: e.id,
  name: e.name,
  status: e.status,
  start_date: day(e.startDate),
  end_date: day(e.endDate),
  venue: e.venue,
  guest_count: e.guestCount,
  order_id: e.orderId,
  customer_id: e.customerId,
  event_type_id: e.eventTypeId,
  event_type_name: e.eventType.name,
  location_id: e.assignedKitchenId,
  location_name: e.assignedKitchen?.name ?? null,
  created_at: e.createdAt.toISOString(),
  updated_at: e.updatedAt.toISOString(),
});

export interface MealPlanRow {
  id: string;
  orderId: string;
  date: Date;
  mealType: string;
  price: unknown;
  menuId: string | null;
  menu: { name: string } | null;
  items: { id: string; itemType: string; menuId: string | null; menuItemId: string | null; addOnId: string | null; name: string; unitPrice: unknown; quantity: number; isExtra: boolean }[];
}

export const mealPlanDto = (m: MealPlanRow) => ({
  id: m.id,
  order_id: m.orderId,
  date: day(m.date),
  meal_type: m.mealType,
  menu_id: m.menuId,
  menu_name: m.menu?.name ?? null,
  price_per_plate: moneyOrNull(m.price),
  items: m.items.map((i) => ({
    id: i.id,
    item_type: i.itemType,
    menu_item_id: i.menuItemId,
    add_on_id: i.addOnId,
    name: i.name,
    unit_price: money(i.unitPrice),
    quantity: i.quantity,
    is_extra: i.isExtra,
  })),
});

export interface OrderRow {
  id: string;
  orderNumber: string | null;
  status: string;
  orderKind: string;
  customerId: string;
  customer: { name: string };
  eventTypeId: string | null;
  eventType: { name: string } | null;
  eventStartDate: Date;
  eventEndDate: Date;
  venue: string | null;
  eventAddress: string | null;
  menuPreference: string | null;
  adultCount: number | null;
  childBelow5Count: number | null;
  child5To10Count: number | null;
  totalParticipants: number | null;
  subtotal: unknown;
  childrenCharge: unknown;
  transportationCost: unknown;
  otherCharges: unknown;
  discount: unknown;
  total: unknown;
  advance: unknown;
  balance: unknown;
  paymentStatus: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  events: { id: string; menuSelection: { kitchenProductionStatus: string } | null }[];
}

export const orderDto = (o: OrderRow) => ({
  id: o.id,
  order_number: o.orderNumber,
  status: o.status,
  kitchen_status: o.events.find((e) => e.menuSelection)?.menuSelection?.kitchenProductionStatus ?? null,
  order_kind: o.orderKind,
  customer_id: o.customerId,
  customer_name: o.customer.name,
  event_type_id: o.eventTypeId,
  event_type_name: o.eventType?.name ?? null,
  event_ids: o.events.map((e) => e.id),
  event_start_date: day(o.eventStartDate),
  event_end_date: day(o.eventEndDate),
  venue: o.venue,
  event_address: o.eventAddress,
  menu_preference: o.menuPreference,
  guests: { adults: o.adultCount, children_below_5: o.childBelow5Count, children_5_to_10: o.child5To10Count, total: o.totalParticipants },
  amounts: {
    subtotal: money(o.subtotal),
    children_charge: money(o.childrenCharge),
    transportation: money(o.transportationCost),
    other_charges: money(o.otherCharges),
    discount: money(o.discount),
    total: money(o.total),
    advance: money(o.advance),
    balance: money(o.balance),
  },
  payment_status: o.paymentStatus,
  notes: o.notes,
  created_at: o.createdAt.toISOString(),
  updated_at: o.updatedAt.toISOString(),
});
