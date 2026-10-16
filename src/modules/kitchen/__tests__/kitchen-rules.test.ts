import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getKitchenRules, setKitchenRules, getKitchenSheetText, setKitchenSheetText, InvalidKitchenRulesError } from "@/modules/kitchen/kitchen-rules";
import { DEFAULT_KITCHEN_SHEET_TEXT } from "@/modules/kitchen/sheet-text";
import { cookQuantity, DEFAULT_KITCHEN_RULES } from "@/modules/menu-approvals/kitchen-production-status";

const cleanupOrgIds: string[] = [];

afterEach(async () => {
  await prisma.tenantSetting.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  cleanupOrgIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Kitchen Rules Org", slug: `kr-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
  });
  cleanupOrgIds.push(org.id);
  return org;
}

describe("kitchen rules", () => {
  it("defaults to 10% extra and 2 days before the event until saved", async () => {
    const org = await makeOrg();
    expect(DEFAULT_KITCHEN_RULES).toEqual({ extraPercent: 10, daysBeforeEvent: 2 });
    expect(await getKitchenRules(org.id)).toEqual(DEFAULT_KITCHEN_RULES);
  });

  it("saves per tenant and rejects out-of-range values", async () => {
    const org = await makeOrg();
    const other = await makeOrg();
    await setKitchenRules(org.id, { extraPercent: 15, daysBeforeEvent: 5 });
    expect(await getKitchenRules(org.id)).toEqual({ extraPercent: 15, daysBeforeEvent: 5 });
    expect(await getKitchenRules(other.id)).toEqual(DEFAULT_KITCHEN_RULES);

    await expect(setKitchenRules(org.id, { extraPercent: 101, daysBeforeEvent: 2 })).rejects.toThrow(InvalidKitchenRulesError);
    await expect(setKitchenRules(org.id, { extraPercent: 10, daysBeforeEvent: 1.5 })).rejects.toThrow(InvalidKitchenRulesError);
    await expect(setKitchenRules(org.id, { extraPercent: 10, daysBeforeEvent: -1 })).rejects.toThrow(InvalidKitchenRulesError);
  });

  it("cook quantity rounds up the extra", () => {
    expect(cookQuantity(44, 10)).toBe(49); // 48.4 -> 49
    expect(cookQuantity(100, 10)).toBe(110);
    expect(cookQuantity(100, 0)).toBe(100);
  });
});

describe("kitchen order sheet texts", () => {
  it("start as the default wording, are saved per kitchen, and a block saved empty stays empty", async () => {
    const org = await makeOrg();
    const other = await makeOrg();
    expect(await getKitchenSheetText(org.id)).toEqual(DEFAULT_KITCHEN_SHEET_TEXT);

    await setKitchenSheetText(org.id, { serviceIncludes: "  Our staff\nOur plates  ", pleaseNote: "" });
    expect(await getKitchenSheetText(org.id)).toEqual({ serviceIncludes: "Our staff\nOur plates", pleaseNote: "" });
    expect(await getKitchenSheetText(other.id)).toEqual(DEFAULT_KITCHEN_SHEET_TEXT);
    // Saving the rules does not touch the texts.
    await setKitchenRules(org.id, { extraPercent: 12, daysBeforeEvent: 1 });
    expect((await getKitchenSheetText(org.id)).serviceIncludes).toBe("Our staff\nOur plates");
  });

  it("rejects a block that is too long", async () => {
    const org = await makeOrg();
    await expect(setKitchenSheetText(org.id, { serviceIncludes: "x".repeat(3001), pleaseNote: "" })).rejects.toThrow(InvalidKitchenRulesError);
  });
});
