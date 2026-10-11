import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { applyDecision, candidatesForOps } from "../apply";
import { updateEntry, listEntries } from "../entries";
import { runLibraryScan } from "../scan";

const orgIds: string[] = [];
const categoryIds: string[] = [];
const dishIds: string[] = [];
const candidateNames: string[] = [];
// No letter repeats in a row: the scan treats "aaaa" as junk.
const unique = () => crypto.randomUUID().replace(/[^a-z]/g, "").replace(/(.)\1+/g, "$1").slice(0, 8);

afterEach(async () => {
  await prisma.libraryCandidate.deleteMany({ where: { OR: [{ name: { in: candidateNames } }, { suggestedMatchId: { in: categoryIds } }] } });
  await prisma.menuCategory.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.systemFoodItem.deleteMany({ where: { id: { in: dishIds } } });
  await prisma.systemFoodCategory.deleteMany({ where: { OR: [{ id: { in: categoryIds } }, { name: { in: candidateNames } }] } });
  orgIds.length = categoryIds.length = dishIds.length = candidateNames.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Category Org", slug: `cat-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  return org;
}
async function libraryCategory(name: string, aliases: string[] = []) {
  candidateNames.push(name);
  const c = await prisma.systemFoodCategory.create({ data: { name, aliases, sortOrder: 9999 } });
  categoryIds.push(c.id);
  return c;
}
const kitchenCategory = (organizationId: string, name: string) => prisma.menuCategory.create({ data: { organizationId, name } });

describe("category candidates", () => {
  it("offers a category name two kitchens use that the library lacks, never one it has (spelling-tolerant), and not a one-kitchen name", async () => {
    const [a, b] = [await makeOrg(), await makeOrg()];
    const word = unique();
    const known = await libraryCategory(`Zlib ${word} Grills`);
    const shared = `Zmob ${word} Counter`;
    const lonely = `Zalone ${word} Corner`;
    candidateNames.push(shared, lonely);
    await kitchenCategory(a.id, shared);
    await kitchenCategory(b.id, shared.toLowerCase());
    await kitchenCategory(a.id, lonely);
    await kitchenCategory(a.id, known.name.slice(0, -1)); // "Grill" for "Grills": the same category
    await kitchenCategory(b.id, known.name);

    const first = await runLibraryScan({ organizationIds: [a.id, b.id], minKitchens: 2 });
    expect(first.candidates).toBeGreaterThanOrEqual(1);
    const found = await prisma.libraryCandidate.findMany({ where: { kind: "CATEGORY", key: { contains: word.toLowerCase() } }, include: { sources: true } });
    expect(found.map((f) => [f.name, f.kitchenCount, f.status])).toEqual([[shared, 2, "PENDING"]]);
    expect(found[0].sources).toHaveLength(2);

    // Ops sees the name and a count only
    const docs = (await candidatesForOps(2)).filter((d) => d.kind === "CATEGORY" && d.name === shared);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ categoryName: null, foodType: null, unit: null, photoUrl: null, kitchenCount: 2 });
    expect(JSON.stringify(docs)).not.toMatch(/Category Org|organizationId/);

    await runLibraryScan({ organizationIds: [a.id, b.id], minKitchens: 2 });
    expect(await prisma.libraryCandidate.count({ where: { kind: "CATEGORY", key: { contains: word.toLowerCase() } } })).toBe(1);
  });

  it("hints a close library category for the reviewer, never merging it by itself", async () => {
    const [a, b] = [await makeOrg(), await makeOrg()];
    const word = unique();
    const lib = await libraryCategory(`Zq ${word} Tandoori Starters`);
    const ours = `Zq ${word} Tandoor Starters Plus`;
    candidateNames.push(ours);
    await kitchenCategory(a.id, ours);
    await kitchenCategory(b.id, ours);
    await runLibraryScan({ organizationIds: [a.id, b.id], minKitchens: 2 });
    const c = await prisma.libraryCandidate.findFirstOrThrow({ where: { kind: "CATEGORY", name: ours } });
    expect(c.suggestedMatchId).toBe(lib.id);
    expect(c.status).toBe("PENDING");
  });
});

describe("applying a category decision", () => {
  async function pending(name = `Zapply ${unique()} Bar`) {
    candidateNames.push(name);
    return prisma.libraryCandidate.create({ data: { kind: "CATEGORY", key: name.toLowerCase(), name, kitchenCount: 3 } });
  }

  it("approve adds the library category (with the reviewer's correction), a second send does nothing, and an existing name asks to merge", async () => {
    const c = await pending();
    const corrected = `${c.name} Corrected`;
    candidateNames.push(corrected);
    expect(await applyDecision({ candidateId: c.id, action: "approve", entry: { name: corrected, categoryName: corrected, foodType: null, unit: null, description: null } })).toBe("applied");
    expect(await prisma.systemFoodCategory.findUnique({ where: { name: corrected } })).not.toBeNull();
    expect(await applyDecision({ candidateId: c.id, action: "approve" })).toBe("already");

    const dup = await pending(`Zdup ${unique()}`);
    await libraryCategory(dup.name.toUpperCase());
    await expect(applyDecision({ candidateId: dup.id, action: "approve" })).rejects.toMatchObject({ status: 409 });
    expect((await prisma.libraryCandidate.findUniqueOrThrow({ where: { id: dup.id } })).status).toBe("PENDING");
  });

  it("merge makes the kitchen's name another name of an existing category; unknown target 404; reject is final", async () => {
    const target = await libraryCategory(`Ztarget ${unique()} Items`);
    const c = await pending();
    await expect(applyDecision({ candidateId: c.id, action: "merge", mergeIntoId: "missing" })).rejects.toMatchObject({ status: 404 });
    await applyDecision({ candidateId: c.id, action: "merge", mergeIntoId: target.id });
    expect((await prisma.systemFoodCategory.findUniqueOrThrow({ where: { id: target.id } })).aliases).toContain(c.name);
    expect(await prisma.libraryCandidate.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ status: "MERGED", mergedIntoId: target.id });

    const r = await pending();
    await applyDecision({ candidateId: r.id, action: "reject" });
    expect((await prisma.libraryCandidate.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("REJECTED");
  });

  it("a dish is approved only into a library category: a spelling of one is accepted as that one, an unknown one is refused", async () => {
    const word = unique();
    const dishName = `Zdish ${word} Special Bowl`;
    candidateNames.push(dishName);
    const make = () => prisma.libraryCandidate.create({ data: { kind: "FOOD_ITEM", key: `${dishName.toLowerCase()}-${unique()}`, name: dishName, categoryName: "Starter", foodType: "VEGETARIAN", kitchenCount: 3 } });
    const a = await make();
    await applyDecision({ candidateId: a.id, action: "approve" }); // typed "Starter" -> "Starters"
    const dish = await prisma.systemFoodItem.findUniqueOrThrow({ where: { name: dishName } });
    dishIds.push(dish.id);
    expect(dish.categoryName).toBe("Starters");

    const other = await prisma.libraryCandidate.create({ data: { kind: "FOOD_ITEM", key: `zz-${unique()}`, name: `Zother ${word} Bowl`, categoryName: "Not A Real Category", foodType: "VEGETARIAN", kitchenCount: 3 } });
    candidateNames.push(other.name);
    await expect(applyDecision({ candidateId: other.id, action: "approve" })).rejects.toMatchObject({ status: 400 });
    expect(await prisma.systemFoodItem.count({ where: { name: other.name } })).toBe(0);
  });
});

describe("editing library categories", () => {
  it("lists them, renames one (its dishes follow, the old name stays as another name), and refuses a taken name or hiding", async () => {
    const word = unique();
    const cat = await libraryCategory(`Zedit ${word} Wraps`);
    const other = await libraryCategory(`Zedit ${word} Rolls`);
    const dish = await prisma.systemFoodItem.create({ data: { name: `Zdish ${word} Wrap`, foodType: "VEGETARIAN", categoryName: cat.name } });
    dishIds.push(dish.id);
    candidateNames.push(dish.name);

    expect((await listEntries("CATEGORY")).find((e) => e.id === cat.id)).toMatchObject({ kind: "CATEGORY", name: cat.name, categoryName: cat.name, isActive: true, foodType: null, unit: null });
    await expect(updateEntry({ id: cat.id, kind: "CATEGORY", isActive: false })).rejects.toMatchObject({ status: 400 });
    await expect(updateEntry({ id: cat.id, kind: "CATEGORY", name: other.name.toLowerCase() })).rejects.toMatchObject({ status: 409 });
    await expect(updateEntry({ id: "nope", kind: "CATEGORY", name: "X" })).rejects.toMatchObject({ status: 404 });

    const renamed = `Zedit ${word} Flatbreads`;
    candidateNames.push(renamed);
    await updateEntry({ id: cat.id, kind: "CATEGORY", name: renamed });
    const after = await prisma.systemFoodCategory.findUniqueOrThrow({ where: { id: cat.id } });
    expect(after.name).toBe(renamed);
    expect(after.aliases).toContain(cat.name);
    expect(await prisma.systemFoodItem.findUniqueOrThrow({ where: { id: dish.id } })).toMatchObject({ categoryName: renamed, editedInOps: true });
  });

  it("a dish edit only takes a library category (a spelling of one is accepted)", async () => {
    const dish = await prisma.systemFoodItem.create({ data: { name: `Zdish ${unique()} Edit`, foodType: "VEGETARIAN", categoryName: "Starters" } });
    dishIds.push(dish.id);
    candidateNames.push(dish.name);
    await expect(updateEntry({ id: dish.id, kind: "FOOD_ITEM", categoryName: "Nonsense Corner" })).rejects.toMatchObject({ status: 400 });
    await updateEntry({ id: dish.id, kind: "FOOD_ITEM", categoryName: "main course" });
    expect((await prisma.systemFoodItem.findUniqueOrThrow({ where: { id: dish.id } })).categoryName).toBe("Main Course");
  });
});
