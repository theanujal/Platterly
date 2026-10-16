import "server-only";
import { getSetting, setSetting } from "@/lib/settings/settings";
import { DEFAULT_KITCHEN_RULES, KITCHEN_RULES_KEY, type KitchenRules } from "@/modules/menu-approvals/kitchen-production-status";
import { DEFAULT_KITCHEN_SHEET_TEXT, KITCHEN_SHEET_TEXT_KEY, KITCHEN_SHEET_TEXT_MAX, type KitchenSheetText } from "./sheet-text";

/** The tenant's kitchen rules, with defaults filling anything they haven't set. */
export async function getKitchenRules(organizationId: string): Promise<KitchenRules> {
  const stored = await getSetting<Partial<KitchenRules>>(organizationId, KITCHEN_RULES_KEY);
  return { ...DEFAULT_KITCHEN_RULES, ...stored };
}

export class InvalidKitchenRulesError extends Error {}

export async function setKitchenRules(organizationId: string, rules: KitchenRules) {
  if (!Number.isFinite(rules.extraPercent) || rules.extraPercent < 0 || rules.extraPercent > 100) {
    throw new InvalidKitchenRulesError("Extra quantity must be between 0 and 100 percent.");
  }
  if (!Number.isInteger(rules.daysBeforeEvent) || rules.daysBeforeEvent < 0 || rules.daysBeforeEvent > 30) {
    throw new InvalidKitchenRulesError("Days before the event must be a whole number between 0 and 30.");
  }
  await setSetting(organizationId, KITCHEN_RULES_KEY, { extraPercent: rules.extraPercent, daysBeforeEvent: rules.daysBeforeEvent });
}

/** The kitchen's own "Service Also Include" and "Please Note" texts; a block never saved falls back to the default wording, a block saved empty stays empty. */
export async function getKitchenSheetText(organizationId: string): Promise<KitchenSheetText> {
  const stored = await getSetting<Partial<KitchenSheetText>>(organizationId, KITCHEN_SHEET_TEXT_KEY);
  return {
    serviceIncludes: typeof stored?.serviceIncludes === "string" ? stored.serviceIncludes : DEFAULT_KITCHEN_SHEET_TEXT.serviceIncludes,
    pleaseNote: typeof stored?.pleaseNote === "string" ? stored.pleaseNote : DEFAULT_KITCHEN_SHEET_TEXT.pleaseNote,
  };
}

export async function setKitchenSheetText(organizationId: string, text: KitchenSheetText) {
  for (const [label, value] of [["Service Also Include", text.serviceIncludes], ["Please Note", text.pleaseNote]] as const) {
    if (value.length > KITCHEN_SHEET_TEXT_MAX) throw new InvalidKitchenRulesError(`${label} can be up to ${KITCHEN_SHEET_TEXT_MAX} characters.`);
  }
  await setSetting(organizationId, KITCHEN_SHEET_TEXT_KEY, { serviceIncludes: text.serviceIncludes.trim(), pleaseNote: text.pleaseNote.trim() });
}
