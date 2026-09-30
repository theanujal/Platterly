import "server-only";
import { getSetting, setSetting } from "@/lib/settings/settings";
import { DEFAULT_KITCHEN_RULES, KITCHEN_RULES_KEY, type KitchenRules } from "@/modules/menu-approvals/kitchen-production-status";

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
