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
export const DEFAULT_ADVANCE_PERCENT = 50;

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

export interface PaymentSettingsView {
  razorpay: { connected: boolean; keyIdMasked: string | null };
  upi: { upiId: string; payeeName: string } | null;
  advancePercent: number;
}

export class PaymentSettingsError extends Error {}

/** UPI ids look like `name@bank`. */
const UPI_ID = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

export async function getPaymentSettingsView(organizationId: string): Promise<PaymentSettingsView> {
  const [razorpay, upi, advance] = await Promise.all([
    getSetting<StoredRazorpay>(organizationId, RAZORPAY_KEY),
    getSetting<StoredUpi>(organizationId, UPI_KEY),
    getSetting<number>(organizationId, ADVANCE_KEY),
  ]);
  return {
    razorpay: { connected: !!razorpay, keyIdMasked: razorpay ? maskKeyId(razorpay.keyId) : null },
    upi: upi ?? null,
    advancePercent: advance ?? DEFAULT_ADVANCE_PERCENT,
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

async function prismaDeleteSetting(organizationId: string, key: string) {
  await prisma.tenantSetting.deleteMany({ where: { organizationId, key } });
}

/** `upi://pay?...` for a QR and the "Open in UPI app" button. The amount is fixed. */
export function buildUpiUri(upi: { upiId: string; payeeName: string }, amount: number, note: string): string {
  const params = new URLSearchParams({ pa: upi.upiId, pn: upi.payeeName, am: amount.toFixed(2), cu: "INR", tn: note.slice(0, 80) });
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}
