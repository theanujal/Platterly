import { describe, it, expect, afterEach, vi } from "vitest";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { catalogImageFromForm, uploadCatalogImage, InvalidImageError } from "@/lib/storage/catalog-image";

// The edit action test below calls the real Server Action as a given person; sign-in and permission checks are stubbed.
const who = vi.hoisted(() => ({ organizationId: "", userId: "" }));
vi.mock("@/lib/auth/require-session", () => ({
  requireActiveOrganization: async () => ({ session: { user: { id: who.userId } }, organizationId: who.organizationId }),
  requirePermission: async () => undefined,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { prisma } from "@/lib/db";
import { updateEventTypeAction } from "@/app/(app)/menu-catalog/event-types/actions";

const orgId = `img-test-${crypto.randomUUID().slice(0, 8)}`;

afterEach(async () => {
  await rm(path.join(process.cwd(), "public", "uploads", "organizations", orgId), { recursive: true, force: true });
});

describe("uploadCatalogImage", () => {
  it("accepts PNG, JPG and WebP and stores each as a WebP at most 1200px wide", async () => {
    const photo = sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#c0392b" } });
    const small = sharp({ create: { width: 300, height: 200, channels: 3, background: "#27ae60" } });
    const uploads = [
      [await photo.clone().png().toBuffer(), "image/png", 1200, 800],
      [await photo.clone().jpeg().toBuffer(), "image/jpeg", 1200, 800],
      [await small.clone().webp().toBuffer(), "image/webp", 300, 200],
    ] as const;
    for (const [data, type, width, height] of uploads) {
      const url = await uploadCatalogImage(orgId, "items", new File([new Uint8Array(data)], "x", { type }));
      expect(url).toMatch(/\.webp$/);
      const stored = await sharp(await readFile(path.join(process.cwd(), "public", url))).metadata();
      expect([stored.format, stored.width, stored.height]).toEqual(["webp", width, height]);
    }
    // A script renamed to look like an image is refused, and so is a file with an image's first bytes that is not a picture.
    await expect(uploadCatalogImage(orgId, "items", new File(["<script>alert(1)</script>"], "x.png", { type: "image/png" }))).rejects.toThrow(/not a real/);
    await expect(uploadCatalogImage(orgId, "items", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])], "x.jpg", { type: "image/jpeg" }))).rejects.toThrow(InvalidImageError);
  });

  it("rejects other types and files over 4MB", async () => {
    await expect(uploadCatalogImage(orgId, "items", new File([new Uint8Array([1])], "x.gif", { type: "image/gif" }))).rejects.toThrow(InvalidImageError);
    await expect(uploadCatalogImage(orgId, "items", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.webp", { type: "image/webp" }))).rejects.toThrow(/4MB/);
  });
});

describe("catalogImageFromForm", () => {
  it("leaves the saved image alone, clears it on Remove image, and a new file wins over both", async () => {
    const form = (entries: [string, string | File][]) => {
      const data = new FormData();
      for (const [key, value] of entries) data.set(key, value);
      return data;
    };
    expect(await catalogImageFromForm(orgId, "items", form([]))).toBeUndefined();
    expect(await catalogImageFromForm(orgId, "items", form([["removeImage", "true"]]))).toBeNull();
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).png().toBuffer();
    const fresh = await catalogImageFromForm(orgId, "items", form([["image", new File([new Uint8Array(png)], "x.png", { type: "image/png" })], ["removeImage", "true"]]));
    expect(fresh).toMatch(new RegExp(`^/uploads/organizations/${orgId}/catalog/items/.+\\.webp$`));
  });
});

describe("edit actions (#107)", () => {
  it("keep the saved image, and never save an image address sent by the browser", async () => {
    const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `img-${crypto.randomUUID()}@example.test`, emailVerified: true } });
    const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Img Co", slug: `img-${crypto.randomUUID().slice(0, 8)}`, status: "ACTIVE", createdAt: new Date() } });
    Object.assign(who, { organizationId: org.id, userId: user.id });
    try {
      const eventType = await prisma.eventType.create({ data: { organizationId: org.id, name: "Wedding", image: "/uploads/old.webp" } });
      const form = new FormData();
      form.set("name", "Wedding");
      // What the Edit drawer sends: no new file, Remove image not pressed.
      expect(await updateEventTypeAction(eventType.id, form)).toEqual({ ok: true });
      // A hand-made request in the old shape, with a "current image" before the form.
      await (updateEventTypeAction as (...args: unknown[]) => Promise<unknown>)(eventType.id, "https://example.com/tracker.png", form);
      expect((await prisma.eventType.findUniqueOrThrow({ where: { id: eventType.id } })).image).toBe("/uploads/old.webp");
    } finally {
      await prisma.auditLog.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
