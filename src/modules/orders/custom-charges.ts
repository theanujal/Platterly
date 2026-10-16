import { percentOf } from "./amount";

/**
 * Team-added lines on an order's Pricing Details: a label and an amount, or a percentage of the subtotal (AJ, 2026-10-16).
 * `amount` always holds the rupees (recalculateOrderTotals refreshes it from `rate` in PERCENTAGE mode), so every reader of the amount stays unchanged.
 * Pure, so the form and the server share it.
 */
export type CustomCharge = {
  label: string;
  amount: number;
  mode?: "FIXED" | "PERCENTAGE";
  /** The percentage of the subtotal, only when `mode` is PERCENTAGE. */
  rate?: number;
};

export const MAX_CUSTOM_CHARGES = 20;

/** Reads whatever is stored or submitted and keeps only well-formed lines with a label and a positive amount (or a positive percentage). */
export function parseCustomCharges(raw: unknown): CustomCharge[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const lines: CustomCharge[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const label = String((entry as { label?: unknown }).label ?? "").trim().slice(0, 80);
    if (!label) continue;
    if ((entry as { mode?: unknown }).mode === "PERCENTAGE") {
      const rate = Math.round(Number((entry as { rate?: unknown }).rate) * 1000) / 1000;
      if (!Number.isFinite(rate) || rate <= 0 || rate > 100) continue;
      const stored = Math.round(Number((entry as { amount?: unknown }).amount) * 100) / 100;
      lines.push({ label, amount: Number.isFinite(stored) && stored > 0 ? stored : 0, mode: "PERCENTAGE", rate });
      continue;
    }
    const amount = Math.round(Number((entry as { amount?: unknown }).amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    lines.push({ label, amount });
  }
  return lines.slice(0, MAX_CUSTOM_CHARGES);
}

/** Gives every percentage line its rupee amount for this subtotal. */
export function resolveCustomCharges(charges: CustomCharge[], subtotal: number): CustomCharge[] {
  return charges.map((c) => (c.mode === "PERCENTAGE" ? { ...c, amount: percentOf(subtotal, c.rate ?? 0) } : c));
}

export function sumCustomCharges(charges: CustomCharge[]): number {
  return Math.round(charges.reduce((sum, c) => sum + c.amount, 0) * 100) / 100;
}
