import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getStorageDriver } from "@/lib/storage/storage";
import { createMenuItem, duplicateMenuItem, updateMenuItem } from "../item";
import { bulkAddFoodItems } from "../import/bulk-add";

const orgIds: string[] = [];
const userIds: string[] = [];
const keys: string[] = [];
afterEach(async () => {
  await prisma.menuItem.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.menuCategory.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  for (const key of keys) await getStorageDriver().delete(key);
  orgIds.length = userIds.length = keys.length = 0;
});
async function setup() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Source Org", slug: `src-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "U", email: `u-${crypto.randomUUID()}@example.test`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
  orgIds.push(org.id);
  userIds.push(user.id);
  return { org, user };
}
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

describe("where a food item's picture came from", () => {
  it("a new picture is the kitchen's upload; no picture means no source; a changed picture is a new upload, the same one keeps its source", async () => {
    const { org, user } = await setup();
    const plain = await createMenuItem(org.id, { name: "No Picture", foodType: "VEGETARIAN", price: 10 }, user.id);
    expect(plain.imageSource).toBeNull();
    const withPic = await createMenuItem(org.id, { name: "With Picture", foodType: "VEGETARIAN", price: 10, image: "/uploads/a.png" }, user.id);
    expect(withPic.imageSource).toBe("upload");

    const library = await createMenuItem(org.id, { name: "From Library", foodType: "VEGETARIAN", price: 10, image: "/catalog/categories/starters.webp", imageSource: "library" }, user.id);
    const same = await updateMenuItem(org.id, library.id, { name: "From Library", foodType: "VEGETARIAN", price: 12, image: "/catalog/categories/starters.webp" }, user.id);
    expect(same.imageSource).toBe("library"); // edited, but the picture is the same one
    const changed = await updateMenuItem(org.id, library.id, { name: "From Library", foodType: "VEGETARIAN", price: 12, image: "/uploads/mine.png" }, user.id);
    expect(changed.imageSource).toBe("upload");
    // Remove image: no picture and no source.
    const removed = await updateMenuItem(org.id, library.id, { name: "From Library", foodType: "VEGETARIAN", price: 12, image: null }, user.id);
    expect([removed.image, removed.imageSource]).toEqual([null, null]);
  });

  it("a duplicate of a library-picture dish stays 'library', and a duplicate of an upload counts as an upload", async () => {
    const { org, user } = await setup();
    const lib = await createMenuItem(org.id, { name: "Lib Dish", foodType: "VEGETARIAN", price: 10, image: "/catalog/categories/starters.webp", imageSource: "library" }, user.id);
    const own = await createMenuItem(org.id, { name: "Own Dish", foodType: "VEGETARIAN", price: 10, image: "/uploads/own.png" }, user.id);
    const libCopy = await duplicateMenuItem(org.id, lib.id, user.id);
    const ownCopy = await duplicateMenuItem(org.id, own.id, user.id);
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: libCopy.id } })).imageSource).toBe("library");
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: ownCopy.id } })).imageSource).toBe("upload");
  });

  it("adding from the catalog marks the picture 'library', and a library-approved upload is copied into the business's own storage", async () => {
    const { org, user } = await setup();
    const libKey = `library/dishes/${crypto.randomUUID()}.png`;
    keys.push(libKey);
    const { url } = await getStorageDriver().upload(libKey, PNG, "image/png");
    const result = await bulkAddFoodItems(org.id, [
      { name: "Approved Photo Dish", foodType: "VEGETARIAN", price: 0, categoryNames: ["Starters"], imageUrl: url },
      { name: "Illustration Dish", foodType: "VEGETARIAN", price: 0, categoryNames: ["Starters"], imageUrl: "/catalog/categories/starters.webp" },
    ], user.id);
    expect(result.created).toBe(2);
    const a = await prisma.menuItem.findFirstOrThrow({ where: { organizationId: org.id, name: "Approved Photo Dish" } });
    const b = await prisma.menuItem.findFirstOrThrow({ where: { organizationId: org.id, name: "Illustration Dish" } });
    expect(a.imageSource).toBe("library");
    expect(a.image).toMatch(new RegExp(`^/uploads/organizations/${org.id}/catalog/items/.+\\.png$`)); // its own copy
    expect(a.image).not.toBe(url);
    keys.push(a.image!.replace("/uploads/", ""));
    expect(b).toMatchObject({ imageSource: "library", image: "/catalog/categories/starters.webp" });
  });
});
