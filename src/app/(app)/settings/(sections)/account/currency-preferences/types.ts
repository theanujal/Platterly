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
