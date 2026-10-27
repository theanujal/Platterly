import { describe, it, expect, afterEach } from "vitest";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { uploadCatalogImage, InvalidImageError } from "@/lib/storage/catalog-image";

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
