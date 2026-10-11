import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getStorageDriver } from "@/lib/storage/storage";
import { applyDecision, candidatesForOps, LIBRARY_PHOTO_CREDIT } from "../apply";
import { runLibraryScan } from "../scan";

const orgIds: string[] = [];
const dishIds: string[] = [];
const storedKeys: string[] = [];
const itemNames: string[] = [];

// A file that passes the PNG signature check, enough for the library to treat it as a picture.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
const unique = () => crypto.randomUUID().replace(/[^a-z]/g, "").replace(/(.)\1+/g, "$1").slice(0, 8);

afterEach(async () => {
  await prisma.libraryCandidate.deleteMany({ where: { key: { in: dishIds } } });
  await prisma.menuItem.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.systemFoodItem.deleteMany({ where: { id: { in: dishIds } } });
  for (const key of storedKeys) await getStorageDriver().delete(key);
  orgIds.length = dishIds.length = storedKeys.length = itemNames.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Photo Org", slug: `ph-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  return org;
}
async function libraryDish(name: string, extra: Record<string, unknown> = {}) {
  const dish = await prisma.systemFoodItem.create({ data: { name, foodType: "VEGETARIAN", categoryName: "Main Course", image: "/catalog/categories/main-course.webp", ...extra } });
  dishIds.push(dish.id);
  return dish;
}
/** A kitchen's dish with a picture it uploaded (a real file in storage). */
async function kitchenDish(organizationId: string, name: string, extra: Record<string, unknown> = {}) {
  const key = `organizations/${organizationId}/catalog/items/${crypto.randomUUID()}.png`;
  storedKeys.push(key);
  const { url } = await getStorageDriver().upload(key, PNG, "image/png");
  return prisma.menuItem.create({ data: { organizationId, name, foodType: "VEGETARIAN", price: 100, image: url, imageSource: "upload", ...extra } });
}

describe("photo candidates", () => {
  it("offers a kitchen's own upload for a library dish that has only an illustration, by exact name or other name", async () => {
    const [a, b] = [await makeOrg(), await makeOrg()];
    const word = unique();
    const dish = await libraryDish(`Photo ${word} Curry`, { aliases: [`Foto ${word} Curry`] });
    const first = await kitchenDish(a.id, `photo ${word} curry`);
    await new Promise((r) => setTimeout(r, 15));
    const newer = await kitchenDish(b.id, `Foto ${word} Curry`);

    await runLibraryScan({ organizationIds: [a.id, b.id], minKitchens: 2 });
    const c = await prisma.libraryCandidate.findUniqueOrThrow({ where: { kind_key: { kind: "PHOTO", key: dish.id } }, include: { sources: true } });
    expect(c).toMatchObject({ kind: "PHOTO", name: dish.name, kitchenCount: 2, status: "PENDING", photoUrl: newer.image, suggestedMatchId: dish.id });
    expect(c.sources.map((s) => s.recordId).sort()).toEqual([first.id, newer.id].sort());

    // Ops gets the dish, the picture as an absolute URL, and nothing about the kitchens
    const docs = (await candidatesForOps(2)).filter((d) => d.kind === "PHOTO" && d.suggestedMatchId === dish.id);
    expect(docs).toHaveLength(1);
    expect(docs[0].photoUrl).toBe(new URL(newer.image!, "http://catering.localhost:3000").toString());
    expect(JSON.stringify(docs)).not.toMatch(/Photo Org|organizationId/);
  });

  it("skips a dish that already has a real photo, copies from the library, close names, and not enough kitchens", async () => {
    const [a, b] = [await makeOrg(), await makeOrg()];
    const word = unique();
    const hasPhoto = await libraryDish(`Has ${word} Photo`, { imageCredit: "Someone, CC BY-SA 4.0" });
    const plain = await libraryDish(`Plain ${word} Dish`);
    const close = await libraryDish(`Close ${word} Biryani`);
    await kitchenDish(a.id, hasPhoto.name);
    await kitchenDish(a.id, plain.name, { imageSource: "library" }); // a copy of the library's own picture
    await kitchenDish(a.id, `Close ${word} Biryani Royal Special Plate`); // near, not the same dish
    await runLibraryScan({ organizationIds: [a.id], minKitchens: 2 });
    expect(await prisma.libraryCandidate.count({ where: { kind: "PHOTO", key: { in: [hasPhoto.id, plain.id, close.id] } } })).toBe(0);

    await kitchenDish(b.id, plain.name); // a real upload, but one kitchen is not enough when two are required
    await runLibraryScan({ organizationIds: [a.id, b.id], minKitchens: 2, minPhotoKitchens: 2 });
    expect(await prisma.libraryCandidate.count({ where: { kind: "PHOTO", key: plain.id } })).toBe(0);
    await runLibraryScan({ organizationIds: [a.id, b.id], minKitchens: 2, minPhotoKitchens: 1 });
    expect(await prisma.libraryCandidate.count({ where: { kind: "PHOTO", key: plain.id } })).toBe(1);
  });
});

describe("applying a photo decision", () => {
  async function pending(extra: Record<string, unknown> = {}) {
    const org = await makeOrg();
    const dish = await libraryDish(`Apply ${unique()} Dish`, extra);
    const item = await kitchenDish(org.id, dish.name);
    await runLibraryScan({ organizationIds: [org.id], minKitchens: 2, minPhotoKitchens: 1 });
    const candidate = await prisma.libraryCandidate.findUniqueOrThrow({ where: { kind_key: { kind: "PHOTO", key: dish.id } } });
    return { org, dish, item, candidate };
  }

  it("approve copies the picture into the library's own folder, marks the dish edited, and repeating does nothing", async () => {
    const { dish, item, candidate } = await pending();
    expect(await applyDecision({ candidateId: candidate.id, action: "approve" })).toBe("applied");
    const after = await prisma.systemFoodItem.findUniqueOrThrow({ where: { id: dish.id } });
    expect(after.image).toMatch(/^\/uploads\/library\/dishes\/.+\.png$/);
    expect(after).toMatchObject({ imageCredit: LIBRARY_PHOTO_CREDIT, editedInOps: true });
    storedKeys.push(after.image!.replace("/uploads/", ""));
    expect(existsSync(path.join(process.cwd(), "public", after.image!))).toBe(true);
    expect(after.image).not.toBe(item.image); // its own copy, not the kitchen's file
    expect(existsSync(path.join(process.cwd(), "public", item.image!))).toBe(true); // the kitchen's file is untouched
    expect((await prisma.libraryCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).status).toBe("APPROVED");
    expect(await applyDecision({ candidateId: candidate.id, action: "approve" })).toBe("already");
  });

  it("refuses to replace a real photo unless the reviewer says so", async () => {
    const { dish, candidate } = await pending();
    await prisma.systemFoodItem.update({ where: { id: dish.id }, data: { imageCredit: "Someone, CC BY-SA 4.0" } });
    await expect(applyDecision({ candidateId: candidate.id, action: "approve" })).rejects.toMatchObject({ status: 409 });
    expect((await prisma.libraryCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).status).toBe("PENDING");
    await applyDecision({ candidateId: candidate.id, action: "approve", replacePhoto: true });
    const after = await prisma.systemFoodItem.findUniqueOrThrow({ where: { id: dish.id } });
    storedKeys.push(after.image!.replace("/uploads/", ""));
    expect(after.imageCredit).toBe(LIBRARY_PHOTO_CREDIT);
  });

  it("answers 410 when the kitchen's file is gone, 400 for a merge, and reject keeps it from being offered again", async () => {
    const { dish, item, candidate } = await pending();
    await getStorageDriver().delete(item.image!.replace("/uploads/", ""));
    await expect(applyDecision({ candidateId: candidate.id, action: "approve" })).rejects.toMatchObject({ status: 410 });
    await expect(applyDecision({ candidateId: candidate.id, action: "merge", mergeIntoId: dish.id })).rejects.toMatchObject({ status: 400 });
    expect((await prisma.systemFoodItem.findUniqueOrThrow({ where: { id: dish.id } })).image).toBe("/catalog/categories/main-course.webp");

    await applyDecision({ candidateId: candidate.id, action: "reject" });
    await runLibraryScan({ organizationIds: [item.organizationId], minKitchens: 2, minPhotoKitchens: 1 });
    expect((await prisma.libraryCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).status).toBe("REJECTED");
  });
});
