import "server-only";
import { randomBytes } from "node:crypto";
import { STAND_FULFILMENT, STAND_MAX_PER_ORDER, type Buyer, type ShipTo, type StandCheckoutAnswer, type StandCheckoutRequest, type StandFulfilment, type StandInvoiceView, type StandOffer, type StandOrderView } from "@platterly/contract";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifySafely } from "@/modules/notifications/notifications";
import { tellOwner } from "@/modules/messages/messages";
import { BillingError, onlineBillingAvailable } from "@/modules/billing/billing";
import { nextInvoiceNumber } from "@/modules/billing/numbering";
import { formatInvoiceNumber, gstKind, gstLines, priceBreakdown, type InvoiceSnapshot } from "@/modules/billing/math";
import { createRazorpayOrder, platformRazorpay, verifyCheckoutSignature } from "@/modules/billing/razorpay";
import { getProfile } from "@/modules/billing/profile";

/**
 * The Order QR stand (docs/ops-contract.md section 33). A kitchen orders 1 to 3 printed A6 acrylic stands; Platterly prices
 * them (set here by staff, per product, with GST), takes payment on its own Razorpay, issues a GST invoice from the product's
 * running number, and then prints and ships: Placed -> Printing -> Shipped -> Delivered, forward only. The kitchen is told by
 * email when the order is placed and when it ships. Everything printed is frozen at checkout.
 */
export class StandError extends BillingError {}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const money = (n: unknown) => Number(n);

async function requireBusiness(businessId: string, productKey: string) {
  const link = await prisma.businessProduct.findUnique({ where: { businessId_productKey: { businessId, productKey } }, include: { business: true } });
  if (!link) throw new BillingError("unknown_business");
  return link.business;
}

/* ---------- price (staff) and offer (product) ---------- */

export async function getStandOffer(productKey: string): Promise<StandOffer> {
  const product = await prisma.product.findUnique({ where: { key: productKey }, select: { standPrice: true, standGstPercent: true } });
  const price = product?.standPrice === null || product?.standPrice === undefined ? null : money(product.standPrice);
  const gst = product ? money(product.standGstPercent) : 18;
  const unit = priceBreakdown(price ?? 0, gst);
  return { available: price !== null && price > 0 && onlineBillingAvailable(), unitAmount: unit.amount, gstPercent: unit.gstPercent, unitGst: unit.gstAmount, unitTotal: unit.total, maxPerOrder: STAND_MAX_PER_ORDER };
}

/** Staff set the price of ONE stand (before GST), the GST rate and optionally the HSN / SAC code for its invoices. Empty price takes the stand off sale. */
export async function setStandPricing(productKey: string, input: { price: number | null; gstPercent: number; hsnCode?: string | null }, actorUserId: string | null) {
  if (input.price !== null && (!Number.isFinite(input.price) || input.price <= 0 || input.price > 100_000)) throw new StandError("Enter a price above 0.");
  if (!Number.isFinite(input.gstPercent) || input.gstPercent < 0 || input.gstPercent > 40) throw new StandError("GST must be between 0 and 40%.");
  const hsn = input.hsnCode?.trim() || null;
  if (hsn && !/^\d{4,8}$/.test(hsn)) throw new StandError("HSN / SAC code is 4 to 8 digits.");
  await prisma.product.update({ where: { key: productKey }, data: { standPrice: input.price, standGstPercent: input.gstPercent, standHsnCode: hsn } });
  await audit({ actorUserId, action: "stand.pricing_set", subject: productKey, detail: { price: input.price, gstPercent: input.gstPercent, hsnCode: hsn } });
}

/* ---------- checkout and payment ---------- */

const newOrderId = () => `stand_${randomBytes(16).toString("hex")}`;

export async function startStandCheckout(input: { businessId: string; productKey: string } & StandCheckoutRequest, fetchImpl: typeof fetch = fetch): Promise<StandCheckoutAnswer> {
  const business = await requireBusiness(input.businessId, input.productKey);
  const creds = platformRazorpay();
  if (!creds) throw new StandError("Online payment is not switched on yet. Please contact Platterly.");
  const offer = await getStandOffer(input.productKey);
  if (!offer.available) throw new StandError("The Order QR stand is not on sale yet. Please contact Platterly.");
  if (input.quantity < 1 || input.quantity > STAND_MAX_PER_ORDER) throw new StandError(`You can order 1 to ${STAND_MAX_PER_ORDER} stands at a time.`);

  const price = priceBreakdown(offer.unitAmount * input.quantity, offer.gstPercent);
  const { razorpayOrderId } = await createRazorpayOrder(creds, { amountRupees: price.total, receipt: `stand-${input.businessId.slice(4, 24)}`, notes: { businessId: input.businessId, productKey: input.productKey, kind: "stand", quantity: String(input.quantity) } }, fetchImpl);
  const order = await prisma.standOrder.create({
    data: {
      id: newOrderId(),
      businessId: input.businessId,
      productKey: input.productKey,
      quantity: input.quantity,
      unitAmount: offer.unitAmount,
      amount: price.amount,
      gstPercent: price.gstPercent,
      gstAmount: price.gstAmount,
      total: price.total,
      razorpayOrderId,
      shipTo: input.shipTo as unknown as Prisma.InputJsonValue,
      buyer: input.buyer as unknown as Prisma.InputJsonValue,
      kitchenName: input.kitchenName,
      kitchenLogoUrl: input.kitchenLogoUrl,
      linkUrl: input.linkUrl,
    },
  });
  await audit({ actorUserId: null, action: "stand.checkout_started", subject: input.businessId, detail: { orderId: order.id, productKey: input.productKey, quantity: input.quantity, total: price.total } });
  return { keyId: creds.keyId, razorpayOrderId, amountPaise: Math.round(price.total * 100), businessName: business.name, description: `Order QR stand x ${input.quantity}`, orderId: order.id };
}

/** Checkout's own signature check, then the same confirmation the webhook does. Only the caller's own order counts. */
export async function verifyStandCheckout(input: { businessId: string; productKey: string; razorpayOrderId: string; razorpayPaymentId: string; signature: string }) {
  await requireBusiness(input.businessId, input.productKey);
  const creds = platformRazorpay();
  if (!creds || !verifyCheckoutSignature({ razorpayOrderId: input.razorpayOrderId, razorpayPaymentId: input.razorpayPaymentId, signature: input.signature }, creds.keySecret)) throw new StandError("We could not verify this payment.");
  const order = await prisma.standOrder.findUnique({ where: { razorpayOrderId: input.razorpayOrderId } });
  if (!order || order.businessId !== input.businessId || order.productKey !== input.productKey) throw new StandError("We could not verify this payment.");
  return confirmStandPayment(input.razorpayOrderId, input.razorpayPaymentId);
}

/**
 * Razorpay says it was captured (checkout verification or webhook, whichever is first). Safe to call twice: only the call that
 * flips PENDING to PAID takes the invoice number and sends the email. Null when no stand order has this Razorpay order id.
 */
export async function confirmStandPayment(razorpayOrderId: string, razorpayPaymentId: string, now: Date = new Date(), capturedPaise?: number) {
  const order = await prisma.standOrder.findUnique({ where: { razorpayOrderId }, include: { business: true } });
  if (!order) return null;
  if (order.paymentStatus === "PAID") return order;
  if (capturedPaise !== undefined && capturedPaise !== Math.round(money(order.total) * 100)) {
    console.error("[stand] captured amount does not match", order.id);
    return null;
  }
  const claimed = await prisma.standOrder.updateMany({ where: { id: order.id, paymentStatus: "PENDING" }, data: { paymentStatus: "PAID", razorpayPaymentId, paidAt: now } });
  if (claimed.count === 0) return prisma.standOrder.findUniqueOrThrow({ where: { id: order.id } });

  const seller = await getProfile();
  const stored = (order.buyer ?? {}) as Partial<Buyer>;
  const buyer = {
    name: stored.name || order.business.name,
    addressLine1: stored.addressLine1 ?? null,
    addressLine2: stored.addressLine2 ?? null,
    city: stored.city ?? null,
    state: stored.state ?? null,
    postalCode: stored.postalCode ?? null,
    country: stored.country ?? null,
    gstin: stored.gstin ?? null,
  };
  const product = await prisma.product.findUniqueOrThrow({ where: { key: order.productKey }, select: { invoicePrefix: true, standHsnCode: true } });
  const prefix = product.invoicePrefix ?? seller.invoicePrefix;
  const kind = gstKind(seller, buyer);
  const snapshot: InvoiceSnapshot = {
    seller: {
      legalName: seller.legalName,
      addressLine1: seller.addressLine1,
      addressLine2: seller.addressLine2,
      city: seller.city,
      state: seller.state,
      stateCode: seller.stateCode,
      postalCode: seller.postalCode,
      country: seller.country,
      gstin: seller.gstin,
      pan: seller.pan,
      // The stand's own HSN / SAC code when staff set one (frozen here), else the seller's SAC code from Billing.
      sacCode: product.standHsnCode || seller.sacCode,
      email: seller.email,
      phone: seller.phone,
      website: seller.website,
      note: seller.invoiceNote,
    },
    buyer,
    gst: { kind, lines: gstLines(kind, money(order.gstPercent), money(order.gstAmount)) },
    highlights: [],
  };

  let invoiceNumber = "";
  await prisma.$transaction(async (tx) => {
    // Taken here, with the order's own update, so a failure leaves no gap in the product's numbering.
    invoiceNumber = formatInvoiceNumber(prefix, buyer.name, now, await nextInvoiceNumber(tx, order.productKey));
    await tx.standOrder.update({ where: { id: order.id }, data: { invoiceNumber, invoiceSnapshot: snapshot as unknown as Prisma.InputJsonObject } });
  });
  await audit({ actorUserId: null, action: "stand.payment_confirmed", subject: order.businessId, detail: { orderId: order.id, productKey: order.productKey, total: money(order.total), invoiceNumber } });
  await notifySafely({ productKey: order.productKey, businessId: order.businessId, kind: "stand.ordered", title: "New Order QR stand order", body: `${order.business.name} ordered ${order.quantity} stand${order.quantity === 1 ? "" : "s"} (invoice ${invoiceNumber}). Print and ship it.`, link: `/stand-orders/${order.id}`, dedupeKey: `stand_ordered:${order.id}` });
  await tellOwner({ businessId: order.businessId, productKey: order.productKey, template: "stand_placed", variables: { quantity: order.quantity, amount: money(order.total), invoiceNumber }, dedupeKey: `stand_placed:${order.id}` });
  return prisma.standOrder.findUniqueOrThrow({ where: { id: order.id } });
}

export async function failStandPayment(razorpayOrderId: string) {
  const order = await prisma.standOrder.findUnique({ where: { razorpayOrderId } });
  if (!order) return false;
  await prisma.standOrder.updateMany({ where: { id: order.id, paymentStatus: "PENDING" }, data: { paymentStatus: "FAILED" } });
  return true;
}

/* ---------- what the product reads ---------- */

type Row = Prisma.StandOrderGetPayload<object>;

function orderView(row: Row): StandOrderView {
  return {
    id: row.id,
    quantity: row.quantity,
    amount: money(row.amount),
    gstPercent: money(row.gstPercent),
    gstAmount: money(row.gstAmount),
    total: money(row.total),
    paymentStatus: row.paymentStatus,
    fulfilment: row.fulfilment,
    shipTo: row.shipTo as unknown as ShipTo,
    linkUrl: row.linkUrl,
    kitchenName: row.kitchenName,
    invoiceNumber: row.invoiceNumber,
    trackingNote: row.trackingNote,
    createdAt: row.createdAt.toISOString(),
    paidAt: iso(row.paidAt),
    shippedAt: iso(row.shippedAt),
    deliveredAt: iso(row.deliveredAt),
  };
}

/** A business's paid stand orders, newest first (unpaid and failed attempts are not shown to the kitchen). */
export async function listStandOrders(businessId: string, productKey: string): Promise<StandOrderView[]> {
  await requireBusiness(businessId, productKey);
  const rows = await prisma.standOrder.findMany({ where: { businessId, productKey, paymentStatus: "PAID" }, orderBy: { createdAt: "desc" } });
  return rows.map(orderView);
}

export async function getStandInvoice(businessId: string, productKey: string, orderId: string): Promise<StandInvoiceView> {
  await requireBusiness(businessId, productKey);
  const row = await prisma.standOrder.findFirst({ where: { id: orderId, businessId, productKey, paymentStatus: "PAID" } });
  if (!row || !row.invoiceNumber || !row.invoiceSnapshot || !row.paidAt) throw new BillingError("unknown_invoice");
  const snapshot = row.invoiceSnapshot as unknown as InvoiceSnapshot;
  return {
    orderId: row.id,
    invoiceNumber: row.invoiceNumber,
    quantity: row.quantity,
    amount: money(row.amount),
    gstPercent: money(row.gstPercent),
    gstAmount: money(row.gstAmount),
    total: money(row.total),
    paidAt: row.paidAt.toISOString(),
    razorpayPaymentId: row.razorpayPaymentId,
    shipTo: row.shipTo as unknown as ShipTo,
    seller: snapshot.seller,
    buyer: snapshot.buyer,
    gst: snapshot.gst,
  };
}

/* ---------- what staff do ---------- */

export async function listStandOrdersForStaff(filter: { fulfilment?: StandFulfilment | "ALL"; productKey?: string | null } = {}) {
  return prisma.standOrder.findMany({
    where: { paymentStatus: "PAID", ...(filter.productKey ? { productKey: filter.productKey } : {}), ...(filter.fulfilment && filter.fulfilment !== "ALL" ? { fulfilment: filter.fulfilment } : {}) },
    include: { business: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function getStandOrderForStaff(id: string) {
  return prisma.standOrder.findUnique({ where: { id }, include: { business: { select: { id: true, name: true, ownerEmail: true } } } });
}

export const nextFulfilment = (current: StandFulfilment): StandFulfilment | null => STAND_FULFILMENT[STAND_FULFILMENT.indexOf(current) + 1] ?? null;

/** Moves a paid order one step forward (Placed, Printing, Shipped, Delivered). Shipping can carry a tracking note and emails the owner. */
export async function advanceStandOrder(id: string, input: { trackingNote?: string | null }, actorUserId: string | null, now: Date = new Date()) {
  const order = await prisma.standOrder.findUnique({ where: { id } });
  if (!order || order.paymentStatus !== "PAID") throw new StandError("This order is not paid, so it cannot move.");
  const next = nextFulfilment(order.fulfilment);
  if (!next) throw new StandError("This order is already delivered.");
  const note = input.trackingNote?.trim().slice(0, 300) || null;
  const stamp = next === "PRINTING" ? { printingAt: now } : next === "SHIPPED" ? { shippedAt: now, trackingNote: note } : { deliveredAt: now };
  // Only the call that moves it from this exact step does the work, so two clicks never skip a step or send two emails.
  const moved = await prisma.standOrder.updateMany({ where: { id, fulfilment: order.fulfilment }, data: { fulfilment: next, ...stamp } });
  if (moved.count === 0) throw new StandError("Someone else just moved this order. Reload and try again.");
  await audit({ actorUserId, action: "stand.fulfilment_moved", subject: order.businessId, detail: { orderId: id, from: order.fulfilment, to: next } });
  if (next === "SHIPPED") {
    await tellOwner({ businessId: order.businessId, productKey: order.productKey, template: "stand_shipped", variables: { quantity: order.quantity, trackingNote: note ?? "" }, dedupeKey: `stand_shipped:${order.id}` });
  }
  return next;
}
