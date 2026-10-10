import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { applyDecision, candidatesForOps, LibraryError } from "../apply";
import { runLibraryScan } from "../scan";

const orgIds: string[] = [];
const userIds: string[] = [];
const systemFoodIds: string[] = [];
const systemIngredientIds: string[] = [];
const candidateNames: string[] = [];

afterEach(async () => {
  await prisma.libraryCandidate.deleteMany({ where: { name: { in: candidateNames } } });
  await prisma.menuItem.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.inventory.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.systemFoodItem.deleteMany({ where: { OR: [{ id: { in: systemFoodIds } }, { name: { in: candidateNames } }] } });
  await prisma.systemIngredient.deleteMany({ where: { OR: [{ id: { in: systemIngredientIds } }, { name: { in: candidateNames } }] } });
  orgIds.length = userIds.length = systemFoodIds.length = systemIngredientIds.length = candidateNames.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Library Org", slug: `lib-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  return org;
}
const unique = () => crypto.randomUUID().replace(/[^a-z]/g, "").slice(0, 8);
const dish = (organizationId: string, name: string, extra: Record<string, unknown> = {}) =>
  prisma.menuItem.create({ data: { organizationId, name, foodType: "VEGETARIAN", price: 123.45, ...extra } });

describe("library scan", () => {
  it("offers a name only once enough different kitchens have it, never a library name, never a library copy", async () => {
    const [a, b, c] = [await makeOrg(), await makeOrg(), await makeOrg()];
    const word = unique();
    const shared = `Zorba ${word} Platter`;
    const lonely = `Lonely ${word} Special`;
    const inLibrary = `Libra ${word} Curry`;
    candidateNames.push(shared, lonely, inLibrary, shared.toLowerCase());
    const lib = await prisma.systemFoodItem.create({ data: { name: inLibrary, foodType: "VEGETARIAN", categoryName: "Main Course" } });
    systemFoodIds.push(lib.id);

    await dish(a.id, shared);
    await dish(b.id, `  ${shared.toLowerCase()} `); // same name, written differently
    await dish(a.id, lonely); // one kitchen only
    await dish(a.id, inLibrary); // the library has it
    await dish(c.id, `Copied ${word} Dish`, { sourceCatalogId: lib.id }); // copied from the library
    await dish(c.id, `Copied ${word} Dish 2`, { sourceCatalogId: lib.id });

    const first = await runLibraryScan({ organizationIds: [a.id, b.id, c.id], minKitchens: 2 });
    expect(first.candidates).toBe(1);
    const found = await prisma.libraryCandidate.findMany({ where: { kind: "FOOD_ITEM", key: { contains: word.toLowerCase() } }, include: { sources: true } });
    expect(found.map((f) => f.kitchenCount)).toEqual([2]);
    expect(found[0].sources).toHaveLength(2);
    expect(found[0].status).toBe("PENDING");

    // running again changes nothing
    await runLibraryScan({ organizationIds: [a.id, b.id, c.id], minKitchens: 2 });
    expect(await prisma.libraryCandidate.count({ where: { key: { contains: word.toLowerCase() } } })).toBe(1);
    expect(await prisma.libraryCandidateSource.count({ where: { candidateId: found[0].id } })).toBe(2);
  });

  it("suggests a close library name, and ingredients become candidates too, with a normalized unit and category", async () => {
    const [a, b] = [await makeOrg(), await makeOrg()];
    const word = unique();
    const libName = `Hyderabadi ${word} Biryani`;
    const ours = `Hydrabadi ${word} Biryani Special Combo`;
    const ingredient = `Rare ${word} Spice`;
    candidateNames.push(ours, ingredient, libName);
    const lib = await prisma.systemFoodItem.create({ data: { name: libName, foodType: "NON_VEGETARIAN", categoryName: "Rice & Biryani" } });
    systemFoodIds.push(lib.id);
    await dish(a.id, ours);
    await dish(b.id, ours);
    for (const org of [a, b]) await prisma.inventory.create({ data: { organizationId: org.id, name: ingredient, category: "spices and masalas", unit: "Kilogram (kg)" } });

    await runLibraryScan({ organizationIds: [a.id, b.id], minKitchens: 2 });
    const food = await prisma.libraryCandidate.findFirstOrThrow({ where: { kind: "FOOD_ITEM", name: ours } });
    expect(food.suggestedMatchId).toBe(lib.id);
    const ing = await prisma.libraryCandidate.findFirstOrThrow({ where: { kind: "INGREDIENT", name: ingredient } });
    expect([ing.categoryName, ing.unit, ing.kitchenCount]).toEqual(["Spices & Masalas", "kg", 2]);
  });
});

describe("what Ops receives", () => {
  it("is only name, category, type, unit and counts: no price, cost, stock, supplier or kitchen", async () => {
    const [a, b] = [await makeOrg(), await makeOrg()];
    const name = `Private ${unique()} Dish`;
    candidateNames.push(name);
    await dish(a.id, name, { price: 777.77, description: "SECRET RECIPE NOTE" });
    await dish(b.id, name, { price: 888.88 });
    await runLibraryScan({ organizationIds: [a.id, b.id], minKitchens: 2 });
    const docs = (await candidatesForOps(2)).filter((c) => c.name === name);
    expect(docs).toHaveLength(1);
    expect(Object.keys(docs[0]).sort()).toEqual(["categoryName", "foodType", "id", "kind", "kitchenCount", "name", "photoUrl", "suggestedMatchId", "suggestedMatchName", "unit", "updatedAt"]);
    const text = JSON.stringify(docs);
    expect(text).not.toMatch(/777|888|SECRET|Library Org|organizationId/);
  });
});

describe("applying a decision", () => {
  async function candidateFor(name: string, orgs: string[], kind: "FOOD_ITEM" | "INGREDIENT" = "FOOD_ITEM") {
    candidateNames.push(name);
    const c = await prisma.libraryCandidate.create({ data: { kind, key: `${name.toLowerCase()}`, name, categoryName: kind === "FOOD_ITEM" ? "Starters" : "Dairy", foodType: kind === "FOOD_ITEM" ? "VEGETARIAN" : null, unit: kind === "INGREDIENT" ? "kg" : null, kitchenCount: orgs.length } });
    return c;
  }

  it("approve creates the library entry (with the reviewer's edits) and a second send does nothing", async () => {
    const name = `Kachumber ${unique()} Roll`;
    const edited = `${name} (Edited)`;
    candidateNames.push(edited);
    const c = await candidateFor(name, ["x", "y"]);
    const entry = { name: edited, categoryName: "Starters", foodType: "VEGETARIAN" as const, unit: null, description: "A roll" };
    expect(await applyDecision({ candidateId: c.id, action: "approve", entry })).toBe("applied");
    const made = await prisma.systemFoodItem.findFirstOrThrow({ where: { name: edited } });
    expect([made.categoryName, made.foodType, made.description]).toEqual(["Starters", "VEGETARIAN", "A roll"]);
    expect(made.image).toMatch(/^\/catalog\/categories\/.*\.svg$/);
    expect((await prisma.libraryCandidate.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("APPROVED");
    expect(await applyDecision({ candidateId: c.id, action: "approve", entry })).toBe("already");
    expect(await prisma.systemFoodItem.count({ where: { name: edited } })).toBe(1);
  });

  it("refuses a name the library already has, and asks for a category and type", async () => {
    const name = `Duplicate ${unique()} Dish`;
    const c = await candidateFor(name, ["x", "y"]);
    const lib = await prisma.systemFoodItem.create({ data: { name, foodType: "VEGETARIAN", categoryName: "Starters" } });
    systemFoodIds.push(lib.id);
    await expect(applyDecision({ candidateId: c.id, action: "approve" })).rejects.toMatchObject({ status: 409 });

    const bare = await prisma.libraryCandidate.create({ data: { kind: "FOOD_ITEM", key: `bare-${unique()}`, name: `Bare ${unique()}`, kitchenCount: 2 } });
    candidateNames.push(bare.name);
    await expect(applyDecision({ candidateId: bare.id, action: "approve" })).rejects.toBeInstanceOf(LibraryError);
  });

  it("merge adds the name as an alias so the next scan no longer offers it; reject is not offered again", async () => {
    const [a, b] = [await makeOrg(), await makeOrg()];
    const word = unique();
    const libName = `Makhani ${word} Gravy`;
    const ours = `Butter ${word} Gravy House Style`;
    const refused = `Refuse ${word} Thing`;
    candidateNames.push(libName, ours, refused);
    const lib = await prisma.systemFoodItem.create({ data: { name: libName, foodType: "VEGETARIAN", categoryName: "Main Course" } });
    systemFoodIds.push(lib.id);
    for (const org of [a, b]) {
      await dish(org.id, ours);
      await dish(org.id, refused);
    }
    await runLibraryScan({ organizationIds: [a.id, b.id], minKitchens: 2 });
    const mergeMe = await prisma.libraryCandidate.findFirstOrThrow({ where: { name: ours } });
    const rejectMe = await prisma.libraryCandidate.findFirstOrThrow({ where: { name: refused } });

    await applyDecision({ candidateId: mergeMe.id, action: "merge", mergeIntoId: lib.id });
    await applyDecision({ candidateId: rejectMe.id, action: "reject" });
    expect((await prisma.systemFoodItem.findUniqueOrThrow({ where: { id: lib.id } })).aliases).toContain(ours);
    expect((await prisma.libraryCandidate.findUniqueOrThrow({ where: { id: mergeMe.id } })).status).toBe("MERGED");

    await runLibraryScan({ organizationIds: [a.id, b.id], minKitchens: 2 });
    expect((await prisma.libraryCandidate.findUniqueOrThrow({ where: { id: rejectMe.id } })).status).toBe("REJECTED");
    expect(await prisma.libraryCandidate.count({ where: { name: { in: [ours, refused] }, status: "PENDING" } })).toBe(0);
  });

  it("approving an ingredient needs a valid category and unit", async () => {
    const name = `Saffron ${unique()} Thread`;
    const c = await candidateFor(name, ["x", "y"], "INGREDIENT");
    await expect(applyDecision({ candidateId: c.id, action: "approve", entry: { name, categoryName: "Gadgets", foodType: null, unit: "kg", description: null } })).rejects.toMatchObject({ status: 400 });
    await applyDecision({ candidateId: c.id, action: "approve", entry: { name, categoryName: "spices and masalas", foodType: null, unit: "Gram (g)", description: null } });
    const made = await prisma.systemIngredient.findFirstOrThrow({ where: { name } });
    expect([made.categoryName, made.unit]).toEqual(["Spices & Masalas", "g"]);
  });

  it("a kitchen's own items never change when the library changes", async () => {
    const [a, b] = [await makeOrg(), await makeOrg()];
    const name = `Untouched ${unique()} Dish`;
    candidateNames.push(name);
    const mine = await dish(a.id, name, { price: 321 });
    await dish(b.id, name);
    await runLibraryScan({ organizationIds: [a.id, b.id], minKitchens: 2 });
    const c = await prisma.libraryCandidate.findFirstOrThrow({ where: { name } });
    await applyDecision({ candidateId: c.id, action: "approve", entry: { name, categoryName: "Starters", foodType: "VEGETARIAN", unit: null, description: null } });
    const after = await prisma.menuItem.findUniqueOrThrow({ where: { id: mine.id } });
    expect([after.name, Number(after.price)]).toEqual([name, 321]);
  });
});
