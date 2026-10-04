import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { getSetting } from "@/lib/settings/settings";
import { menuGuestCount, itemMovesPrice, mealBaseAmount } from "@/modules/orders/meal-pricing";
import { computeInvoiceStatus, splitInclusiveGst } from "./invoice-status";

const INVOICE_TERMS_KEY = "communication.invoiceTerms";
export const DEFAULT_GST_RATE = 5;
// Outdoor catering services.
const DEFAULT_SAC = "996333";

export class InvoiceError extends Error {}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pad = (n: number) => String(n).padStart(4, "0");

export async function nextInvoiceNumber(organizationId: string, type: "INVOICE" | "RECEIPT"): Promise<string> {
  if (type === "INVOICE") {
    const org = await prisma.organization.update({ where: { id: organizationId }, data: { invoiceNextValue: { increment: 1 } }, select: { invoiceNextValue: true } });
    return `INV-${pad(org.invoiceNextValue - 1)}`;
  }
  const org = await prisma.organization.update({ where: { id: organizationId }, data: { receiptNextValue: { increment: 1 } }, select: { receiptNextValue: true } });
  return `RCT-${pad(org.receiptNextValue - 1)}`;
}

const MEAL_LABEL: Record<string, string> = { BREAKFAST: "Breakfast", LUNCH: "Lunch", HITEA: "Hi-Tea", DINNER: "Dinner", OTHER: "Other" };
const dayLabel = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

interface DraftLine {
  description: string;
  detail?: string;
  quantity: number;
  rate: number;
}

/** The order's own price rules turned into invoice lines. A final adjustment line guarantees the lines add up to the order total. */
export function buildInvoiceLines(order: {
  adultCount: number | null;
  totalParticipants: number | null;
  individualPricingEnabled: boolean;
  childrenCharge: number;
  transportationCost: number;
  otherCharges: number;
  discount: number;
  total: number;
  mealPlanEntries: { date: Date; mealType: string; price: number | null; menuName: string | null; menuPricePerPlate: number | null; items: { name: string; itemType: string; unitPrice: number; quantity: number; isExtra: boolean }[] }[];
}): DraftLine[] {
  const guests = menuGuestCount(order);
  const lines: DraftLine[] = [];
  for (const entry of order.mealPlanEntries) {
    const meal = { price: entry.price, menuPricePerPlate: entry.menuPricePerPlate, items: [] };
    const base = mealBaseAmount(meal, order.individualPricingEnabled, guests);
    const detail = `${MEAL_LABEL[entry.mealType] ?? entry.mealType}, ${dayLabel(entry.date)}`;
    if (base > 0 || entry.menuName) {
      lines.push(
        order.individualPricingEnabled
          ? { description: entry.menuName ?? "Catering", detail, quantity: 1, rate: base }
          : { description: entry.menuName ?? "Catering", detail, quantity: guests, rate: entry.menuPricePerPlate ?? 0 },
      );
    }
    for (const item of entry.items) {
      if (!itemMovesPrice(item) || item.unitPrice * item.quantity === 0) continue;
      lines.push({ description: item.name, detail: `${item.isExtra ? "Extra item" : "Add-on"}, ${MEAL_LABEL[entry.mealType] ?? entry.mealType}`, quantity: item.quantity, rate: item.unitPrice });
    }
  }
  if (order.childrenCharge > 0) lines.push({ description: "Children charges", quantity: 1, rate: order.childrenCharge });
  if (order.transportationCost > 0) lines.push({ description: "Transportation", quantity: 1, rate: order.transportationCost });
  if (order.otherCharges > 0) lines.push({ description: "Other charges", quantity: 1, rate: order.otherCharges });
  if (order.discount > 0) lines.push({ description: "Discount", quantity: 1, rate: -order.discount });

  const sum = round2(lines.reduce((s, l) => s + l.quantity * l.rate, 0));
  const gap = round2(order.total - sum);
  if (Math.abs(gap) >= 0.01) lines.push({ description: "Adjustment", quantity: 1, rate: gap });
  return lines;
}

export interface GenerateInvoiceOptions {
  dueDate?: Date | null;
  gstType?: "CGST_SGST" | "IGST";
  gstRate?: number;
  actorUserId?: string;
}

export async function generateInvoiceFromOrder(organizationId: string, orderId: string, options: GenerateInvoiceOptions = {}) {
  const [order, organization, terms] = await Promise.all([
    prisma.order.findFirstOrThrow({
      where: { id: orderId, organizationId },
      include: { customer: true, mealPlanEntries: { orderBy: [{ date: "asc" }, { mealType: "asc" }], include: { items: true, menu: true } } },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    getSetting<string>(organizationId, INVOICE_TERMS_KEY),
  ]);
  const existing = await prisma.invoice.findFirst({ where: { organizationId, orderId, type: "INVOICE", status: { not: "CANCELLED" } } });
  if (existing) throw new InvoiceError(`This order already has invoice ${existing.number}.`);

  const total = Number(order.total);
  if (total <= 0) throw new InvoiceError("This order has no amount yet, so there is nothing to invoice.");

  const gstEnabled = organization.gstShowOnInvoices === true;
  const gstRate = gstEnabled ? (options.gstRate ?? DEFAULT_GST_RATE) : 0;
  if (gstRate < 0 || gstRate > 28) throw new InvoiceError("GST rate must be between 0 and 28.");
  const gstType = options.gstType ?? "CGST_SGST";
  const split = splitInclusiveGst(total, gstRate, gstType);

  const lines = buildInvoiceLines({
    adultCount: order.adultCount,
    totalParticipants: order.totalParticipants,
    individualPricingEnabled: order.individualPricingEnabled,
    childrenCharge: Number(order.childrenCharge),
    transportationCost: Number(order.transportationCost),
    otherCharges: Number(order.otherCharges),
    discount: Number(order.discount),
    total,
    mealPlanEntries: order.mealPlanEntries.map((e) => ({
      date: e.date,
      mealType: e.mealType,
      price: e.price === null ? null : Number(e.price),
      menuName: e.menu?.name ?? null,
      menuPricePerPlate: e.menu ? Number(e.menu.pricePerPlate) : null,
      items: e.items.map((i) => ({ name: i.name, itemType: i.itemType, unitPrice: Number(i.unitPrice), quantity: i.quantity, isExtra: i.isExtra })),
    })),
  });

  const number = await nextInvoiceNumber(organizationId, "INVOICE");
  const addressParts = [organization.addressLine1, organization.addressLine2, organization.city, organization.state, organization.postalCode].filter(Boolean);
  const invoice = await prisma.invoice.create({
    data: {
      organizationId,
      orderId,
      type: "INVOICE",
      number,
      status: "DRAFT",
      dueDate: options.dueDate === undefined ? order.eventStartDate : options.dueDate,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      customerEmail: order.customer.email,
      customerAddress: order.eventAddress,
      businessName: organization.name,
      businessAddress: addressParts.join(", ") || null,
      businessGstNumber: organization.gstNumber,
      gstEnabled,
      gstType,
      gstRate,
      taxableValue: split.taxableValue,
      cgst: split.cgst,
      sgst: split.sgst,
      igst: split.igst,
      total,
      terms: terms?.trim() ? terms : null,
      items: {
        create: lines.map((line, index) => ({
          description: line.description,
          detail: line.detail ?? null,
          hsnSac: gstEnabled ? DEFAULT_SAC : null,
          quantity: line.quantity,
          rate: line.rate,
          amount: round2(line.quantity * line.rate),
          sortOrder: index,
        })),
      },
    },
    include: { items: true },
  });
  await syncInvoiceStatuses(orderId);
  await audit({ organizationId, actorUserId: options.actorUserId, action: "invoice.create", recordType: "Invoice", recordId: invoice.id, after: { number, orderId, total } });
  return invoice;
}

export async function confirmedPaidForOrder(orderId: string): Promise<number> {
  const result = await prisma.payment.aggregate({ where: { orderId, status: "CONFIRMED" }, _sum: { amount: true } });
  return Number(result._sum.amount ?? 0);
}

/** Re-derives every INVOICE's status for an order from its confirmed payments. */
export async function syncInvoiceStatuses(orderId: string) {
  const [invoices, paid] = await Promise.all([prisma.invoice.findMany({ where: { orderId, type: "INVOICE" } }), confirmedPaidForOrder(orderId)]);
  for (const invoice of invoices) {
    const status = computeInvoiceStatus({ total: Number(invoice.total), paid, sentAt: invoice.sentAt, cancelled: invoice.status === "CANCELLED" });
    if (status !== invoice.status) await prisma.invoice.update({ where: { id: invoice.id }, data: { status } });
  }
}

export async function getInvoice(organizationId: string, id: string) {
  return prisma.invoice.findFirst({
    where: { id, organizationId },
    include: { items: { orderBy: { sortOrder: "asc" } }, order: { select: { id: true, orderNumber: true, total: true, eventStartDate: true, eventType: { select: { name: true } } } } },
  });
}

export async function cancelInvoice(organizationId: string, id: string, actorUserId: string) {
  const invoice = await prisma.invoice.findFirstOrThrow({ where: { id, organizationId, type: "INVOICE" } });
  if (invoice.status === "PAID" || invoice.status === "PARTIALLY_PAID") throw new InvoiceError("An invoice with payments on it cannot be cancelled.");
  await prisma.invoice.update({ where: { id }, data: { status: "CANCELLED" } });
  await audit({ organizationId, actorUserId, action: "invoice.cancel", recordType: "Invoice", recordId: id, before: { status: invoice.status } });
}

export async function listInvoices(organizationId: string, filter: { type?: "INVOICE" | "RECEIPT"; search?: string; locationId?: string | null } = {}) {
  const invoices = await prisma.invoice.findMany({
    where: { organizationId, ...(filter.type ? { type: filter.type } : {}), ...(filter.locationId ? { order: { events: { some: { assignedKitchenId: filter.locationId } } } } : {}) },
    orderBy: { createdAt: "desc" },
    include: { order: { select: { id: true, orderNumber: true, customer: { select: { name: true } }, venue: true } } },
  });
  const orderIds = [...new Set(invoices.map((i) => i.orderId))];
  const paid = await prisma.payment.groupBy({ by: ["orderId"], where: { orderId: { in: orderIds }, status: "CONFIRMED" }, _sum: { amount: true } });
  const paidByOrder = new Map(paid.map((p) => [p.orderId, Number(p._sum.amount ?? 0)]));
  return invoices.map((invoice) => ({ ...invoice, paid: paidByOrder.get(invoice.orderId) ?? 0 }));
}

/** An invoice by its secure link token's resource id, with what the customer's page needs. */
export async function getInvoiceForCustomer(organizationId: string, id: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId },
    include: { items: { orderBy: { sortOrder: "asc" } }, order: { select: { orderNumber: true, eventStartDate: true, eventType: { select: { name: true } } } } },
  });
  if (!invoice) return null;
  const paid = invoice.type === "INVOICE" ? await confirmedPaidForOrder(invoice.orderId) : Number(invoice.total);
  return { invoice, paid };
}
