import { isValidPhone, normalizePhone, whatsappDigits } from "@/lib/phone";

/** Pure helpers for sending a purchase order to a supplier over WhatsApp click-to-chat. No prices go in the message. */

export interface PoMessageLine {
  name: string;
  quantity: number;
  unit: string;
}

/** 33 -> "33", 2.5 -> "2.5", 0.1 + 0.2 -> "0.3" (no trailing zeros, at most 3 decimals). */
const qty = (n: number) => String(Math.round(n * 1000) / 1000);

export function buildPoWhatsappMessage({ supplierName, number, lines }: { supplierName: string; number: string; lines: PoMessageLine[] }): string {
  const items = lines.map((l) => `• ${l.name} — ${qty(l.quantity)} ${l.unit}`).join("\n");
  return [`Hello ${supplierName},`, "", "Please confirm availability for the following purchase order.", "", `Purchase Order: ${number}`, "", items, "", "Please confirm availability and expected delivery.", "", "Thank you."].join("\n");
}

/** The click-to-chat link for a supplier's saved phone, or null when there is no usable number (missing, or not valid for its country). */
export function whatsappOrderLink(phone: string | null | undefined, message: string): string | null {
  if (!phone?.trim()) return null;
  if (!isValidPhone(normalizePhone(phone))) return null;
  return `https://wa.me/${whatsappDigits(phone)}?text=${encodeURIComponent(message)}`;
}
