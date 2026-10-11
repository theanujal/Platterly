import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { LibraryError } from "../apply";
import { listEntries, updateEntry } from "../entries";

const names: string[] = [];
const unique = () => `Zq${crypto.randomUUID().replace(/[^a-z]/g, "").slice(0, 8)}`;
afterEach(async () => {
  await prisma.systemFoodItem.deleteMany({ where: { name: { in: names } } });
  await prisma.systemIngredient.deleteMany({ where: { name: { in: names } } });
  names.length = 0;
});
const dish = async (name = unique(), extra: Record<string, unknown> = {}) => {
  names.push(name);
  return prisma.systemFoodItem.create({ data: { name, foodType: "VEGETARIAN", categoryName: "Starters", ...extra } });
};
const ingredient = async (name = unique()) => {
  names.push(name);
  return prisma.systemIngredient.create({ data: { name, categoryName: "Spices & Masalas", unit: "kg" } });
};

describe("library entries (Ops editor)", () => {
  it("lists dishes and ingredients with their fields, hidden ones included", async () => {
    const d = await dish(unique(), { isActive: false, aliases: ["Other name"] });
    const i = await ingredient();
    const foods = await listEntries("FOOD_ITEM");
    expect(foods.find((e) => e.id === d.id)).toMatchObject({ kind: "FOOD_ITEM", foodType: "VEGETARIAN", unit: null, isActive: false, aliases: ["Other name"] });
    expect((await listEntries("INGREDIENT")).find((e) => e.id === i.id)).toMatchObject({ kind: "INGREDIENT", unit: "kg", foodType: null });
  });

  it("changes a dish, marks it edited, and keeps the old name as an alias after a rename", async () => {
    const d = await dish();
    const renamed = unique();
    names.push(renamed);
    await updateEntry({ id: d.id, kind: "FOOD_ITEM", name: renamed, categoryName: "Main Course", foodType: "NON_VEGETARIAN", description: "Better text" });
    const after = await prisma.systemFoodItem.findUniqueOrThrow({ where: { id: d.id } });
    expect(after).toMatchObject({ name: renamed, categoryName: "Main Course", foodType: "NON_VEGETARIAN", description: "Better text", editedInOps: true });
    expect(after.aliases).toContain(d.name);
  });

  it("hides and shows an entry without deleting it, and repeating a change is harmless", async () => {
    const d = await dish();
    await updateEntry({ id: d.id, kind: "FOOD_ITEM", isActive: false });
    await updateEntry({ id: d.id, kind: "FOOD_ITEM", isActive: false });
    expect((await prisma.systemFoodItem.findUniqueOrThrow({ where: { id: d.id } })).isActive).toBe(false);
    await updateEntry({ id: d.id, kind: "FOOD_ITEM", isActive: true });
    expect((await prisma.systemFoodItem.findUniqueOrThrow({ where: { id: d.id } })).isActive).toBe(true);
  });

  it("refuses a name or alias another entry already has (409) and an unknown entry (404)", async () => {
    const a = await dish();
    const b = await dish();
    await expect(updateEntry({ id: b.id, kind: "FOOD_ITEM", name: a.name })).rejects.toMatchObject({ status: 409 });
    await expect(updateEntry({ id: b.id, kind: "FOOD_ITEM", aliases: [a.name.toLowerCase()] })).rejects.toMatchObject({ status: 409 });
    await expect(updateEntry({ id: "nope", kind: "FOOD_ITEM", name: "X" })).rejects.toBeInstanceOf(LibraryError);
  });

  it("checks an ingredient's category and unit against the allowed lists", async () => {
    const i = await ingredient();
    await expect(updateEntry({ id: i.id, kind: "INGREDIENT", categoryName: "Nonsense" })).rejects.toMatchObject({ status: 400 });
    await expect(updateEntry({ id: i.id, kind: "INGREDIENT", unit: "furlong" })).rejects.toMatchObject({ status: 400 });
    await updateEntry({ id: i.id, kind: "INGREDIENT", categoryName: "Dairy", unit: "ltr" });
    expect(await prisma.systemIngredient.findUniqueOrThrow({ where: { id: i.id } })).toMatchObject({ categoryName: "Dairy", unit: "ltr", editedInOps: true });
  });

  it("never touches a kitchen's own copy of the dish", async () => {
    const d = await dish();
    const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Entries Org", slug: `ent-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
    try {
      const own = await prisma.menuItem.create({ data: { organizationId: org.id, name: d.name, foodType: "VEGETARIAN", price: 99, sourceCatalogId: d.id } });
      await updateEntry({ id: d.id, kind: "FOOD_ITEM", name: unique(), foodType: "NON_VEGETARIAN" });
      expect(await prisma.menuItem.findUniqueOrThrow({ where: { id: own.id } })).toMatchObject({ name: d.name, foodType: "VEGETARIAN" });
    } finally {
      await prisma.menuItem.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
  });
});
