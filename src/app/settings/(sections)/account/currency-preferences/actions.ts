"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getSetting, setSetting } from "@/lib/settings/settings";
import { CURRENCY_PREFERENCES_KEY, DEFAULT_CURRENCY_PREFERENCES, type CurrencyPreferences } from "./types";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Chunk 5 Group 5.1 — display/formatting only, confirmed judgment call: no
 * second tax regime, India GST stays the only real tax engine. Nothing else
 * reads this yet; later chunks rendering money can look it up when they
 * exist. First real caller of `TenantSetting` (Chunk 2 scaffold, zero
 * callers until now).
 */
export async function getCurrencyPreferencesAction(organizationId: string): Promise<CurrencyPreferences> {
  const stored = await getSetting<CurrencyPreferences>(organizationId, CURRENCY_PREFERENCES_KEY);
  return stored ?? DEFAULT_CURRENCY_PREFERENCES;
}

export async function updateCurrencyPreferencesAction(formData: FormData): Promise<ActionResult> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);

  const symbol = String(formData.get("symbol") ?? "").trim();
  const decimalPlaces = Number(formData.get("decimalPlaces"));
  const roundingModeRaw = String(formData.get("roundingMode") ?? "none");
  const ROUNDING_MODES = ["none", "nearest_1", "nearest_5", "nearest_10"] as const;
  if (!symbol) {
    return { ok: false, error: "Currency symbol is required." };
  }
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 4) {
    return { ok: false, error: "Decimal places must be a whole number between 0 and 4." };
  }
  if (!ROUNDING_MODES.includes(roundingModeRaw as (typeof ROUNDING_MODES)[number])) {
    return { ok: false, error: "Invalid rounding mode." };
  }
  const roundingMode = roundingModeRaw as (typeof ROUNDING_MODES)[number];

  await setSetting(organizationId, CURRENCY_PREFERENCES_KEY, {
    symbol,
    decimalPlaces,
    roundingMode,
  } satisfies CurrencyPreferences);

  revalidatePath("/settings/account/currency-preferences");
  return { ok: true };
}
