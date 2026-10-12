import { fail, isRecord, ok, type ParseResult } from "./result";
import { parseBuyer, type Buyer, type CheckoutAnswer } from "./billing";

/**
 * The Order QR stand (docs/ops-contract.md section 33): a paid, physical A6 acrylic stand printed with a kitchen's logo, name
 * and a QR code to its direct public link. The kitchen orders it from the product; Platterly Ops holds the price, the money,
 * the invoice and the printing / shipping. Same signed billing API as plans: catering asks, ops answers.
 */

/** 1 to 3 stands in one order; a kitchen can order again any time. */
export const STAND_MAX_PER_ORDER = 3;

/** Where an order is in Platterly's hands once it is paid. Forward only. */
export const STAND_FULFILMENT = ["PLACED", "PRINTING", "SHIPPED", "DELIVERED"] as const;
export type StandFulfilment = (typeof STAND_FULFILMENT)[number];

export const STAND_PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED"] as const;
export type StandPaymentStatus = (typeof STAND_PAYMENT_STATUSES)[number];

export interface ShipTo {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string | null;
}

function short(value: unknown, max: number, required: boolean, label: string): ParseResult<string | null> {
  if (value === undefined || value === null || value === "") return required ? fail(`${label} is required`) : ok(null);
  if (typeof value !== "string" || value.trim().length > max) return fail(`${label} must be short text`);
  const trimmed = value.trim();
  return trimmed ? ok(trimmed) : required ? fail(`${label} is required`) : ok(null);
}

export function parseShipTo(input: unknown): ParseResult<ShipTo> {
  if (!isRecord(input)) return fail("shipTo must be an object");
  const out: Record<string, string | null> = {};
  const fields: [keyof ShipTo, boolean, string][] = [
    ["name", true, "Name"],
    ["phone", true, "Phone"],
    ["addressLine1", true, "Address"],
    ["addressLine2", false, "Address line 2"],
    ["city", true, "City"],
    ["state", true, "State"],
    ["postalCode", true, "PIN code"],
    ["country", false, "Country"],
  ];
  for (const [key, required, label] of fields) {
    const result = short(input[key], 200, required, label);
    if (!result.ok) return result;
    out[key] = result.value;
  }
  if (!/^[0-9+()\-\s]{7,20}$/.test(out.phone ?? "")) return fail("Phone must be a valid number");
  if (!/^[0-9A-Za-z\- ]{4,10}$/.test(out.postalCode ?? "")) return fail("PIN code must be valid");
  return ok(out as unknown as ShipTo);
}

/** What the stand is printed with, frozen at the order: a later change of link or logo never alters a printed stand. */
export interface StandCheckoutRequest {
  quantity: number;
  shipTo: ShipTo;
  buyer: Buyer;
  kitchenName: string;
  /** An address ops can fetch the kitchen's logo from; null when the kitchen has none. */
  kitchenLogoUrl: string | null;
  /** The kitchen's direct public link, exactly as the QR will encode it (no redirect). */
  linkUrl: string;
}

export function parseStandCheckoutRequest(input: unknown): ParseResult<StandCheckoutRequest> {
  if (!isRecord(input)) return fail("body must be an object");
  const quantity = input.quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > STAND_MAX_PER_ORDER) return fail(`quantity must be 1 to ${STAND_MAX_PER_ORDER}`);
  const shipTo = parseShipTo(input.shipTo);
  if (!shipTo.ok) return shipTo;
  const buyer = parseBuyer(input.buyer);
  if (!buyer.ok) return buyer;
  const kitchenName = short(input.kitchenName, 200, true, "kitchenName");
  if (!kitchenName.ok) return kitchenName;
  const logo = short(input.kitchenLogoUrl, 1000, false, "kitchenLogoUrl");
  if (!logo.ok) return logo;
  const link = short(input.linkUrl, 500, true, "linkUrl");
  if (!link.ok) return link;
  if (!/^https?:\/\//.test(link.value ?? "")) return fail("linkUrl must be a web address");
  return ok({ quantity, shipTo: shipTo.value, buyer: buyer.value, kitchenName: kitchenName.value as string, kitchenLogoUrl: logo.value, linkUrl: link.value as string });
}

/* ---------- answers ---------- */

/** Price of one stand, set by Platterly staff in ops. `available` is false until a price is set and online payment is on. */
export interface StandOffer {
  available: boolean;
  unitAmount: number;
  gstPercent: number;
  unitGst: number;
  unitTotal: number;
  maxPerOrder: number;
}

export interface StandCheckoutAnswer extends CheckoutAnswer {
  orderId: string;
}

export interface StandOrderView {
  id: string;
  quantity: number;
  amount: number;
  gstPercent: number;
  gstAmount: number;
  total: number;
  paymentStatus: StandPaymentStatus;
  /** Only meaningful once paid. */
  fulfilment: StandFulfilment;
  shipTo: ShipTo;
  linkUrl: string;
  kitchenName: string;
  invoiceNumber: string | null;
  trackingNote: string | null;
  createdAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export function isStandFulfilment(value: unknown): value is StandFulfilment {
  return typeof value === "string" && (STAND_FULFILMENT as readonly string[]).includes(value);
}

/** The frozen invoice for one paid stand order, so the product prints it with its own design. */
export interface StandInvoiceView {
  orderId: string;
  invoiceNumber: string;
  quantity: number;
  amount: number;
  gstPercent: number;
  gstAmount: number;
  total: number;
  paidAt: string;
  razorpayPaymentId: string | null;
  shipTo: ShipTo;
  seller: {
    legalName: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    stateCode: string | null;
    postalCode: string | null;
    country: string | null;
    gstin: string | null;
    pan: string | null;
    sacCode: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    note: string | null;
  };
  buyer: Buyer;
  gst: { kind: "INTRA" | "INTER" | "UNKNOWN"; lines: { label: string; amount: number }[] };
}
