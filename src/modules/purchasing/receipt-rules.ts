/**
 * The explicit rules for booking a delivery (pure, so they can be tested without a database).
 *
 * - Quantity: what was accepted, greater than zero. Above what is still to arrive on the order it is refused unless the
 *   extra is authorised with a reason (recorded on the receipt line, with the actual cost); it is never taken in silently.
 * - Unit cost: the actual price paid per stock unit, required. Negative is refused; zero is accepted only as confirmed free
 *   goods with a reason. An unknown cost is not possible on a receipt (it exists only on manual Stock In and opening stock).
 * - Received date: not in the future and not before the order was raised.
 * - Expiry date: required when the item tracks expiry, optional otherwise; never before the received date and not already
 *   past (an expired delivery is refused at the door, not booked).
 * - Lot, invoice number and notes are optional, with a length limit.
 */

export class ReceiptError extends Error {}

/** Categories whose items track expiry by default when an item is created (the item's own "Tracks expiry" setting is what is enforced). */
export const EXPIRY_DEFAULT_CATEGORIES: readonly string[] = ["Dairy", "Vegetables", "Fruits", "Meat & Poultry", "Seafood"];

export const defaultTracksExpiry = (category: string) => EXPIRY_DEFAULT_CATEGORIES.includes(category);

export const MIN_REASON_LENGTH = 3;
export const MAX_REASON_LENGTH = 300;

/** A free-text reason, trimmed and checked; used for free goods and for authorising an extra quantity. */
export function checkReason(value: string | null | undefined, what: string): string {
  const reason = value?.trim() ?? "";
  if (reason.length < MIN_REASON_LENGTH) throw new ReceiptError(`${what}`);
  if (reason.length > MAX_REASON_LENGTH) throw new ReceiptError(`The reason is too long (at most ${MAX_REASON_LENGTH} characters).`);
  return reason;
}

/** Costs are stored to 2 decimals and quantities to 3, so anything finer is refused rather than rounded (a cost of 0.004 would otherwise be saved as a free 0.00). */
const hasMoreDecimals = (n: number, places: number) => Math.abs(n * 10 ** places - Math.round(n * 10 ** places)) > 1e-6;

export function checkQuantityPrecision(name: string, quantity: number) {
  if (!Number.isFinite(quantity)) throw new ReceiptError(`Enter a valid quantity for ${name}.`);
  if (hasMoreDecimals(quantity, 3)) throw new ReceiptError(`The quantity for ${name} can have at most 3 decimal places.`);
}

/** One check of a unit cost, shared by receipts and manual Stock In: negative is refused, zero (free goods) needs a reason. */
export function checkUnitCost(name: string, unitCost: number, costNote?: string | null) {
  if (!Number.isFinite(unitCost)) throw new ReceiptError(`Enter the unit cost for ${name}.`);
  if (unitCost < 0) throw new ReceiptError(`The unit cost for ${name} cannot be negative.`);
  if (hasMoreDecimals(unitCost, 2)) throw new ReceiptError(`The unit cost for ${name} can have at most 2 decimal places.`);
  if (unitCost > MAX_UNIT_COST) throw new ReceiptError(`The unit cost for ${name} is too large.`);
  if (unitCost === 0) checkReason(costNote, `${name} has a unit cost of 0. Confirm it is free (for example a free sample) and say why.`);
}

export const MAX_UNIT_COST = 10_000_000;
export const MAX_LOT_LENGTH = 60;
export const MAX_INVOICE_LENGTH = 60;
export const MAX_NOTES_LENGTH = 1000;

const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export interface ReceiptHeaderCheck {
  receivedDate: Date;
  /** Today's calendar date at UTC midnight. */
  today: Date;
  /** When the order was raised (any time on that day counts). */
  orderPlacedAt: Date;
  invoiceNumber?: string | null;
  notes?: string | null;
  idempotencyKey: string;
}

export function checkReceiptHeader(h: ReceiptHeaderCheck) {
  if (!h.idempotencyKey || h.idempotencyKey.length > 100) throw new ReceiptError("This receipt could not be identified. Close the window and try again.");
  if (Number.isNaN(h.receivedDate.getTime())) throw new ReceiptError("Enter the date the stock was received.");
  if (day(h.receivedDate) > day(h.today)) throw new ReceiptError("The received date cannot be in the future.");
  if (day(h.receivedDate) < day(new Date(Date.UTC(h.orderPlacedAt.getFullYear(), h.orderPlacedAt.getMonth(), h.orderPlacedAt.getDate())))) {
    throw new ReceiptError("The received date cannot be before the order was raised.");
  }
  if ((h.invoiceNumber?.length ?? 0) > MAX_INVOICE_LENGTH) throw new ReceiptError(`The invoice number is too long (at most ${MAX_INVOICE_LENGTH} characters).`);
  if ((h.notes?.length ?? 0) > MAX_NOTES_LENGTH) throw new ReceiptError(`The notes are too long (at most ${MAX_NOTES_LENGTH} characters).`);
}

export interface ReceiptLineCheck {
  name: string;
  /** The item's own "Tracks expiry" setting. */
  tracksExpiry: boolean;
  /** Still to arrive on the order. */
  remaining: number;
  quantity: number;
  unitCost: number;
  costNote?: string | null;
  /** The reason the person gave for taking more than was ordered. */
  extraReason?: string | null;
  expiryDate?: Date | null;
  lotNumber?: string | null;
  receivedDate: Date;
  today: Date;
}

export function checkReceiptLine(l: ReceiptLineCheck) {
  if (!(l.quantity > 0) || !Number.isFinite(l.quantity)) throw new ReceiptError(`Enter a quantity greater than zero for ${l.name}.`);
  checkQuantityPrecision(l.name, l.quantity);
  if (l.quantity > l.remaining + 0.0005) {
    checkReason(l.extraReason, `${l.name}: ${l.quantity} is more than the ${l.remaining} still to arrive on this order. To book the extra, authorise it and give the reason.`);
  }
  checkUnitCost(l.name, l.unitCost, l.costNote);
  if ((l.lotNumber?.length ?? 0) > MAX_LOT_LENGTH) throw new ReceiptError(`The lot number for ${l.name} is too long (at most ${MAX_LOT_LENGTH} characters).`);
  if (l.expiryDate) {
    if (Number.isNaN(l.expiryDate.getTime())) throw new ReceiptError(`Enter a valid expiry date for ${l.name}.`);
    if (day(l.expiryDate) < day(l.receivedDate)) throw new ReceiptError(`${l.name}: the expiry date cannot be before the received date.`);
    if (day(l.expiryDate) < day(l.today)) throw new ReceiptError(`${l.name}: this delivery has already expired, so it cannot be booked.`);
  } else if (l.tracksExpiry) {
    throw new ReceiptError(`Enter an expiry date for ${l.name} (it tracks expiry).`);
  }
}
