/** Team-added lines on an order's Pricing Details (a label and an amount). Pure, so the form and the server share it. */
export type CustomCharge = {
  label: string;
  amount: number;
};

export const MAX_CUSTOM_CHARGES = 20;

/** Reads whatever is stored or submitted and keeps only well-formed lines with a label and a positive amount. */
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
    const amount = Math.round(Number((entry as { amount?: unknown }).amount) * 100) / 100;
    if (!label || !Number.isFinite(amount) || amount <= 0) continue;
    lines.push({ label, amount });
  }
  return lines.slice(0, MAX_CUSTOM_CHARGES);
}

export function sumCustomCharges(charges: CustomCharge[]): number {
  return Math.round(charges.reduce((sum, c) => sum + c.amount, 0) * 100) / 100;
}
