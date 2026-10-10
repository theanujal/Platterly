import "server-only";
import { prisma } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings/settings";
import { decryptSecret, encryptSecret, maskKeyId } from "./secret-box";

/**
 * A kitchen's own payment setup (Chunk 14): its Razorpay account, its UPI id, and the advance
 * percentage. Customers pay the kitchen directly; Platterly never holds the money. Secrets are stored
 * encrypted and are never returned to a browser: `getPaymentSettingsView` only has masked values.
 */

const RAZORPAY_KEY = "payments.razorpay";
const UPI_KEY = "payments.upi";
const ADVANCE_KEY = "payments.advancePercent";
const ENABLED_KEY = "payments.enabled";
const GST_KEY = "payments.gst";
const AUTO_INVOICE_KEY = "payments.autoInvoice";
export const DEFAULT_ADVANCE_PERCENT = 50;
/** Outdoor catering, the rate a new kitchen starts with; every kitchen can change it on the Payments settings page. */
export const DEFAULT_GST_RATE = 5;
export type GstType = "CGST_SGST" | "IGST";

interface StoredRazorpay {
  keyId: string;
  keySecret: string; // encrypted
  webhookSecret: string; // encrypted
}
interface StoredUpi {
  upiId: string;
  payeeName: string;
}

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export type PaymentMethodKey = "razorpay" | "upi";

export interface PaymentSettingsView {
  /** `connected` = keys saved; `enabled` = connected AND switched on, i.e. offered to customers. */
  razorpay: { connected: boolean; keyIdMasked: string | null; enabled: boolean };
  upi: { upiId: string; payeeName: string; enabled: boolean } | null;
  advancePercent: number;
  /** GST (AJ, 2026-10-10): the number and the show-on-invoices switch live on the business, the rate and type are defaults for every new invoice. */
  gst: GstSettings;
  /** Create the invoice automatically when an order is sent to the kitchen. On unless switched off. */
  autoInvoice: boolean;
  /** True when at least one method is switched on, so customers have something to pay with. */
  customersCanPay: boolean;
}

export interface GstSettings {
  number: string;
  showOnInvoices: boolean;
  rate: number;
  type: GstType;
}

export class PaymentSettingsError extends Error {}

/** UPI ids look like `name@bank`. */
const UPI_ID = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

export async function getPaymentSettingsView(organizationId: string): Promise<PaymentSettingsView> {
  const [razorpay, upi, advance, flags, gst, autoInvoice] = await Promise.all([
    getSetting<StoredRazorpay>(organizationId, RAZORPAY_KEY),
    getSetting<StoredUpi>(organizationId, UPI_KEY),
    getSetting<number>(organizationId, ADVANCE_KEY),
    getSetting<{ razorpay?: boolean; upi?: boolean }>(organizationId, ENABLED_KEY),
    getGstSettings(organizationId),
    getAutoInvoice(organizationId),
  ]);
  // A method that is set up is on until the kitchen switches it off.
  const razorpayEnabled = !!razorpay && flags?.razorpay !== false;
  const upiEnabled = !!upi && flags?.upi !== false;
  return {
    razorpay: { connected: !!razorpay, keyIdMasked: razorpay ? maskKeyId(razorpay.keyId) : null, enabled: razorpayEnabled },
    upi: upi ? { ...upi, enabled: upiEnabled } : null,
    advancePercent: advance ?? DEFAULT_ADVANCE_PERCENT,
    gst,
    autoInvoice,
    customersCanPay: razorpayEnabled || upiEnabled,
  };
}

/** Decrypted credentials, for server code that talks to Razorpay. Never pass the result to a client. */
export async function getRazorpayCredentials(organizationId: string): Promise<RazorpayCredentials | null> {
  const stored = await getSetting<StoredRazorpay>(organizationId, RAZORPAY_KEY);
  if (!stored) return null;
  return { keyId: stored.keyId, keySecret: decryptSecret(stored.keySecret), webhookSecret: decryptSecret(stored.webhookSecret) };
}

export async function saveRazorpay(organizationId: string, input: { keyId: string; keySecret: string; webhookSecret: string }) {
  const keyId = input.keyId.trim();
  const existing = await getSetting<StoredRazorpay>(organizationId, RAZORPAY_KEY);
  if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) throw new PaymentSettingsError("Key ID should look like rzp_live_xxxxxxxx or rzp_test_xxxxxxxx.");
  // A blank secret keeps the saved one, so the form never has to show it again.
  const keySecret = input.keySecret.trim() ? encryptSecret(input.keySecret.trim()) : existing?.keySecret;
  const webhookSecret = input.webhookSecret.trim() ? encryptSecret(input.webhookSecret.trim()) : existing?.webhookSecret;
  if (!keySecret) throw new PaymentSettingsError("Key Secret is required.");
  if (!webhookSecret) throw new PaymentSettingsError("Webhook Secret is required.");
  await setSetting(organizationId, RAZORPAY_KEY, { keyId, keySecret, webhookSecret } satisfies StoredRazorpay);
}

/** Which methods customers are offered. Both on means both show; a method can only be switched on once it is set up. */
export async function setMethodEnabled(organizationId: string, method: PaymentMethodKey, enabled: boolean) {
  const view = await getPaymentSettingsView(organizationId);
  const configured = method === "razorpay" ? view.razorpay.connected : view.upi !== null;
  if (enabled && !configured) throw new PaymentSettingsError(method === "razorpay" ? "Save your Razorpay keys first." : "Save your UPI ID first.");
  const flags = (await getSetting<{ razorpay?: boolean; upi?: boolean }>(organizationId, ENABLED_KEY)) ?? {};
  await setSetting(organizationId, ENABLED_KEY, { ...flags, [method]: enabled });
}

export async function disconnectRazorpay(organizationId: string) {
  await prismaDeleteSetting(organizationId, RAZORPAY_KEY);
}

export async function saveUpi(organizationId: string, input: { upiId: string; payeeName: string }) {
  const upiId = input.upiId.trim();
  const payeeName = input.payeeName.trim();
  if (!upiId && !payeeName) return prismaDeleteSetting(organizationId, UPI_KEY);
  if (!UPI_ID.test(upiId)) throw new PaymentSettingsError("UPI ID should look like name@bank.");
  if (!payeeName) throw new PaymentSettingsError("Enter the name shown in the UPI app.");
  if (payeeName.length > 60) throw new PaymentSettingsError("Keep the name under 60 characters.");
  await setSetting(organizationId, UPI_KEY, { upiId, payeeName } satisfies StoredUpi);
}

export async function saveAdvancePercent(organizationId: string, percent: number) {
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) throw new PaymentSettingsError("Advance must be a whole number from 1 to 100.");
  await setSetting(organizationId, ADVANCE_KEY, percent);
}

/** The kitchen's GST setup: its number and switch (on the business) and the default rate and type for new invoices. */
export async function getGstSettings(organizationId: string): Promise<GstSettings> {
  const [org, stored] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { gstNumber: true, gstShowOnInvoices: true } }),
    getSetting<{ rate?: number; type?: string }>(organizationId, GST_KEY),
  ]);
  return {
    number: org.gstNumber ?? "",
    showOnInvoices: org.gstShowOnInvoices === true,
    rate: typeof stored?.rate === "number" ? stored.rate : DEFAULT_GST_RATE,
    type: stored?.type === "IGST" ? "IGST" : "CGST_SGST",
  };
}

export async function saveGstSettings(organizationId: string, input: { number: string; showOnInvoices: boolean; rate: number; type: string }) {
  const number = input.number.trim().toUpperCase();
  if (number && !/^[0-9A-Z]{15}$/.test(number)) throw new PaymentSettingsError("A GST number is 15 letters and digits, for example 29ABCDE1234F1Z5.");
  if (!Number.isFinite(input.rate) || input.rate < 0 || input.rate > 28) throw new PaymentSettingsError("GST rate must be between 0 and 28.");
  if (input.type !== "CGST_SGST" && input.type !== "IGST") throw new PaymentSettingsError("Choose CGST + SGST or IGST.");
  if (input.showOnInvoices && !number) throw new PaymentSettingsError("Enter your GST number to show GST on invoices.");
  await prisma.organization.update({ where: { id: organizationId }, data: { gstNumber: number || null, gstShowOnInvoices: input.showOnInvoices } });
  await setSetting(organizationId, GST_KEY, { rate: Math.round(input.rate * 100) / 100, type: input.type });
}

export async function getAutoInvoice(organizationId: string): Promise<boolean> {
  return (await getSetting<boolean>(organizationId, AUTO_INVOICE_KEY)) !== false;
}

export async function setAutoInvoice(organizationId: string, enabled: boolean) {
  await setSetting(organizationId, AUTO_INVOICE_KEY, enabled);
}

async function prismaDeleteSetting(organizationId: string, key: string) {
  await prisma.tenantSetting.deleteMany({ where: { organizationId, key } });
}

/** `upi://pay?...` for a QR and the "Open in UPI app" button. The amount is fixed. */
export function buildUpiUri(upi: { upiId: string; payeeName: string }, amount: number, note: string): string {
  const params = new URLSearchParams({ pa: upi.upiId, pn: upi.payeeName, am: amount.toFixed(2), cu: "INR", tn: note.slice(0, 80) });
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}
