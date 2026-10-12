import "server-only";
import { parseShipTo, STAND_MAX_PER_ORDER, type CheckoutAnswer, type ShipTo, type StandCheckoutAnswer, type StandInvoiceView, type StandOffer, type StandOrderView } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { canonicalUrl } from "@/lib/seo/canonical";
import { opsLink } from "@/modules/ops-link/config";
import { opsBilling, opsBillingOk, OpsUnavailableError } from "@/modules/ops-link/billing-client";

/**
 * The Order QR stand (docs/ops-contract.md section 33), the kitchen's side. Price, payment, invoice and printing / shipping
 * all live in Platterly Ops; this asks over the signed billing API (it needs the ops link, not the OPS_BILLING cutover flag,
 * because the stand has no local copy). The QR on the printed stand is the kitchen's direct public link, exactly: there is
 * no redirect, so a kitchen that changes its link later breaks the stands it already has (the Settings page warns first).
 */

export { STAND_MAX_PER_ORDER };

async function businessIdOf(organizationId: string): Promise<string> {
  return (await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { businessId: true } })).businessId;
}

const ordersPath = (businessId: string) => `/businesses/${businessId}/stand/orders`;

/** The kitchen's direct public link, as printed in the QR, or null until the kitchen has claimed one. */
export async function standLinkUrl(organizationId: string): Promise<string | null> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { slug: true, slugChangeCount: true, status: true } });
  return org.slugChangeCount > 0 && org.status === "ACTIVE" ? canonicalUrl(`/${org.slug}`) : null;
}

/** The business address and a contact number, to pre-fill "ship to" (the kitchen can edit or type a new address). */
export async function defaultShipTo(organizationId: string): Promise<ShipTo> {
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const owner = [o.ownerFirstName, o.ownerLastName].filter(Boolean).join(" ");
  return {
    name: owner || (o.name === "Unnamed Business" ? "" : o.name),
    phone: o.contactPhone ?? "",
    addressLine1: o.addressLine1 ?? "",
    addressLine2: o.addressLine2,
    city: o.city ?? "",
    state: o.state ?? "",
    postalCode: o.postalCode ?? "",
    country: o.country ?? "India",
  };
}

export interface StandPageData {
  /** The ops link is not set up, or ops could not be reached. The page then says so instead of showing a price. */
  unavailable: boolean;
  offer: StandOffer | null;
  orders: StandOrderView[];
  /** The kitchen's direct link (what the QR encodes), or null while no link is claimed. */
  linkUrl: string | null;
  kitchenName: string;
  kitchenLogo: string | null;
  shipTo: ShipTo;
}

export async function getStandPageData(organizationId: string): Promise<StandPageData> {
  const [org, linkUrl, shipTo] = await Promise.all([prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, logo: true } }), standLinkUrl(organizationId), defaultShipTo(organizationId)]);
  const base = { linkUrl, kitchenName: org.name, kitchenLogo: org.logo, shipTo };
  if (!opsLink()) return { unavailable: true, offer: null, orders: [], ...base };
  try {
    const businessId = await businessIdOf(organizationId);
    const [offer, list] = await Promise.all([opsBillingOk<StandOffer>("GET", "/stand/offer"), opsBillingOk<{ orders: StandOrderView[] }>("GET", ordersPath(businessId))]);
    return { unavailable: false, offer, orders: list.orders, ...base };
  } catch (error) {
    if (!(error instanceof OpsUnavailableError) && !(error instanceof ValidationError)) throw error;
    return { unavailable: true, offer: null, orders: [], ...base };
  }
}

/** True when this kitchen has a paid stand order: a changed link would break it. A failed lookup says false (no warning, nothing blocked). */
export async function hasPrintedStands(organizationId: string): Promise<boolean> {
  if (!opsLink()) return false;
  try {
    const list = await opsBillingOk<{ orders: StandOrderView[] }>("GET", ordersPath(await businessIdOf(organizationId)));
    return list.orders.length > 0;
  } catch {
    return false;
  }
}

/** Where ops can fetch the kitchen's logo from: an uploaded file path is made absolute with the app's own address. */
function absoluteLogo(logo: string | null): string | null {
  if (!logo) return null;
  return /^https?:\/\//.test(logo) ? logo : canonicalUrl(logo);
}

/** Starts the order: validates the address, then asks ops for a Razorpay order. Returns what Razorpay Checkout needs. */
export async function startStandOrder(organizationId: string, quantity: number, shipToInput: unknown): Promise<StandCheckoutAnswer> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > STAND_MAX_PER_ORDER) throw new ValidationError(`You can order 1 to ${STAND_MAX_PER_ORDER} stands at a time.`);
  const shipTo = parseShipTo(shipToInput);
  if (!shipTo.ok) throw new ValidationError(shipTo.error);
  const linkUrl = await standLinkUrl(organizationId);
  if (!linkUrl) throw new ValidationError("Set your Platterly link first: the QR on the stand points to it.");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const buyer = { name: org.name === "Unnamed Business" ? "Business" : org.name, addressLine1: org.addressLine1, addressLine2: org.addressLine2, city: org.city, state: org.state, postalCode: org.postalCode, country: org.country, gstin: org.gstNumber };
  return opsBillingOk<StandCheckoutAnswer>("POST", ordersPath(await businessIdOf(organizationId)), { quantity, shipTo: shipTo.value, buyer, kitchenName: org.name, kitchenLogoUrl: absoluteLogo(org.logo), linkUrl });
}

export async function verifyStandOrder(organizationId: string, params: { razorpayOrderId: string; razorpayPaymentId: string; signature: string }): Promise<void> {
  await opsBillingOk<{ ok: boolean }>("POST", `${ordersPath(await businessIdOf(organizationId))}/verify`, params);
}

/** The frozen invoice for one paid stand order, or null when it is not this kitchen's. */
export async function getStandInvoice(organizationId: string, orderId: string): Promise<StandInvoiceView | null> {
  const { status, json } = await opsBilling<StandInvoiceView>("GET", `${ordersPath(await businessIdOf(organizationId))}/${encodeURIComponent(orderId)}/invoice`);
  if (status === 404) return null;
  if (status !== 200) throw new OpsUnavailableError();
  return json;
}

export type { CheckoutAnswer };
