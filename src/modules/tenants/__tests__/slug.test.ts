import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { slugify, generateUniqueSlug } from "@/modules/tenants/slug";

const cleanupOrgIds: string[] = [];

afterEach(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  cleanupOrgIds.length = 0;
});

describe("slugify (Chunk 4 Group 4.2)", () => {
  it("lowercases and replaces spaces/punctuation with hyphens", () => {
    expect(slugify("Wedding Bells!")).toBe("wedding-bells");
  });

  it("trims leading/trailing hyphens produced by leading/trailing punctuation", () => {
    expect(slugify("-- Spicy Kitchen --")).toBe("spicy-kitchen");
  });

  it("caps at 20 characters", () => {
    const result = slugify("A Very Long Catering Business Name Indeed");
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it("falls back to 'caterer' when nothing alphanumeric survives", () => {
    expect(slugify("★★★")).toBe("caterer");
  });
});

describe("generateUniqueSlug (Chunk 4 Group 4.2)", () => {
  it("returns the plain slugified name when it's available", async () => {
    const name = `Unique Co ${crypto.randomUUID().slice(0, 6)}`;
    const slug = await generateUniqueSlug(name);
    expect(slug).toBe(slugify(name));
  });

  it("appends a numeric suffix on collision", async () => {
    const name = `Collide ${crypto.randomUUID().slice(0, 6)}`;
    const baseSlug = slugify(name);

    const existing = await prisma.organization.create({
      data: { id: crypto.randomUUID(), name, slug: baseSlug, createdAt: new Date() },
    });
    cleanupOrgIds.push(existing.id);

    const generated = await generateUniqueSlug(name);
    expect(generated).not.toBe(baseSlug);
    expect(generated).toBe(`${baseSlug}-2`);
  });
});
