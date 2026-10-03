import { describe, it, expect, afterEach } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { uploadCatalogImage, InvalidImageError } from "@/lib/storage/catalog-image";

const orgId = `img-test-${crypto.randomUUID().slice(0, 8)}`;

afterEach(async () => {
  await rm(path.join(process.cwd(), "public", "uploads", "organizations", orgId), { recursive: true, force: true });
});

describe("uploadCatalogImage", () => {
  it("accepts PNG, JPG and WebP and keeps the right extension", async () => {
    const bytes: Record<string, number[]> = {
      "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0],
      "image/jpeg": [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0],
      "image/webp": [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0],
    };
    for (const [type, ext] of [["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]] as const) {
      const url = await uploadCatalogImage(orgId, "items", new File([new Uint8Array(bytes[type])], `x.${ext}`, { type }));
      expect(url).toMatch(new RegExp(`\\.${ext}$`));
    }
    // A script renamed to look like an image is refused.
    await expect(uploadCatalogImage(orgId, "items", new File(["<script>alert(1)</script>"], "x.png", { type: "image/png" }))).rejects.toThrow(/not a real/);
  });

  it("rejects other types and files over 4MB", async () => {
    await expect(uploadCatalogImage(orgId, "items", new File([new Uint8Array([1])], "x.gif", { type: "image/gif" }))).rejects.toThrow(InvalidImageError);
    await expect(uploadCatalogImage(orgId, "items", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.webp", { type: "image/webp" }))).rejects.toThrow(/4MB/);
  });
});
