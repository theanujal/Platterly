import { kitchenAtMyLocation } from "@/modules/locations/active-location";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { getKitchenPrepSheet } from "@/modules/menu-approvals/menu-approval";
import { MEAL_TYPE_LABEL } from "@/modules/menu-approvals/approval-snapshot";
import { buildKitchenSheetPdf } from "@/modules/menu-approvals/kitchen-sheet-pdf";
import { getKitchenSheetText } from "@/modules/kitchen/kitchen-rules";
import { textToPoints } from "@/modules/kitchen/sheet-text";
import { getLogisticsSlots, listLogistics } from "@/modules/logistics/logistics";
import { formatPhoneDisplay } from "@/lib/phone";

const formatDate = (date: Date, options: Intl.DateTimeFormatOptions) => date.toLocaleDateString("en-IN", { timeZone: "UTC", ...options });

/**
 * The kitchen order as a PDF in the kitchen's own sheet format (AJ, 2026-10-17; before that the plain preparation list of 2026-09-30).
 * `?download=1` sends it as an attachment for "Download PDF"; without it the browser shows it inline, which is what the Print button
 * loads and prints. Same permission as the page.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ menus: ["view"] }, organizationId);

  const sheet = await getKitchenPrepSheet(organizationId, id);
  if (!sheet || !(await kitchenAtMyLocation(organizationId, session.user.id, sheet.selection.event.assignedKitchenId))) return new Response("Not found", { status: 404 });
  const { selection, meals, guests, extraPercent, kitchenNotes } = sheet;
  const { event } = selection;
  const order = event.order;

  const [organization, sheetText, logistics] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, addressLine1: true, addressLine2: true, city: true, state: true, contactPhone: true } }),
    getKitchenSheetText(organizationId),
    listLogistics(organizationId, event.id),
  ]);

  // Each meal's own pickup time (an order with several events has a logistics record per event); the event's own record is the fallback.
  const perEvent = (await getLogisticsSlots(organizationId, event.id)).slots.length >= 2;
  const pickupFor = (meal: { date: Date; mealType: string }): Date | null => {
    const own = perEvent ? logistics.find((row) => row.slotKey === `${meal.date.toISOString().slice(0, 10)}-${meal.mealType}`) : undefined;
    return (own ?? logistics.find((row) => row.slotKey === ""))?.dispatchPlannedAt ?? null;
  };
  const adults = order?.adultCount ?? guests;
  const manyDays = new Set(meals.map((meal) => meal.date.getTime())).size > 1;
  const days = [...new Set(meals.map((meal) => meal.date.getTime()))].sort();
  const notes = [kitchenNotes, event.notes].filter((note) => note?.trim()).join("\n");

  const doc = buildKitchenSheetPdf({
    kitchen: {
      name: organization.name,
      address: [organization.addressLine1, organization.addressLine2, organization.city, organization.state].filter(Boolean).join(", "),
      phone: organization.contactPhone ? formatPhoneDisplay(organization.contactPhone) : null,
    },
    orderNumber: order?.orderNumber ?? null,
    bookingDate: formatDate(order?.createdAt ?? selection.createdAt, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    customerName: event.customer.name,
    eventType: event.eventType.name,
    notes: notes || null,
    serviceIncludes: textToPoints(sheetText.serviceIncludes),
    pleaseNote: textToPoints(sheetText.pleaseNote),
    meals: meals.map((meal) => ({
      title: MEAL_TYPE_LABEL[meal.mealType],
      dayLabel: manyDays ? `Day ${days.indexOf(meal.date.getTime()) + 1}` : null,
      dateText: formatDate(meal.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
      pickup: pickupFor(meal)?.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).toUpperCase() ?? null,
      totalGuests: guests,
      adults,
      under5: order?.childBelow5Count ?? 0,
      age5to10: order?.child5To10Count ?? 0,
      cookFor: Math.ceil((guests * (100 + extraPercent)) / 100),
      extraPercent,
      menuName: meal.menuName,
      // Dishes by category; add-ons and live counters go under "Service Also Include" instead.
      categories: meal.categories.filter((category) => category.name !== "Add-ons").map((category) => ({ name: category.name, items: category.items.map((item) => item.name) })),
      extras: (meal.categories.find((category) => category.name === "Add-ons")?.items ?? []).map((item) => (item.guestQuantity > 1 ? `${item.name} (x${item.guestQuantity})` : item.name)),
    })),
  });

  const download = new URL(request.url).searchParams.has("download");
  const filename = `kitchen-${order?.orderNumber ?? selection.id}.pdf`;
  return new Response(doc.output("arraybuffer"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
