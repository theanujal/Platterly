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
    for (const [type, ext] of [["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]] as const) {
      const url = await uploadCatalogImage(orgId, "items", new File([new Uint8Array([1, 2, 3])], `x.${ext}`, { type }));
      expect(url).toMatch(new RegExp(`\\.${ext}$`));
    }
  });

  it("rejects other types and files over 4MB", async () => {
    await expect(uploadCatalogImage(orgId, "items", new File([new Uint8Array([1])], "x.gif", { type: "image/gif" }))).rejects.toThrow(InvalidImageError);
    await expect(uploadCatalogImage(orgId, "items", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.webp", { type: "image/webp" }))).rejects.toThrow(/4MB/);
  });
});
