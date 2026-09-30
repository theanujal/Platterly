/**
 * Kept out of actions.ts — a "use server" file may only export async
 * functions; a plain const/interface export there breaks the entire
 * module's export processing at build time (Next.js's server-actions
 * transform), not just the offending export.
 */
export interface CurrencyPreferences {
  symbol: string;
  decimalPlaces: number;
  roundingMode: "none" | "nearest_1" | "nearest_5" | "nearest_10";
}

export const CURRENCY_PREFERENCES_KEY = "currency.preferences";

export const DEFAULT_CURRENCY_PREFERENCES: CurrencyPreferences = {
  symbol: "₹",
  decimalPlaces: 2,
  roundingMode: "none",
};

export const ROUNDING_OPTIONS: { value: CurrencyPreferences["roundingMode"]; label: string }[] = [
  { value: "none", label: "No rounding" },
  { value: "nearest_1", label: "Nearest 1" },
  { value: "nearest_5", label: "Nearest 5" },
  { value: "nearest_10", label: "Nearest 10" },
];
