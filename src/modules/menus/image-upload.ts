import "server-only";
import { getStorageDriver } from "@/lib/storage/storage";

export class InvalidImageError extends Error {}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

/**
 * Shared by MenuItem/Menu/MenuPackage image uploads — same 2MB PNG/JPG rule
 * as Chunk 4's business-profile logo upload (Chunk 2.3's storage driver).
 * Keyed by a random id rather than the entity's own id: the entity doesn't
 * exist yet at create time, and a fresh key per upload means an edit's new
 * image never collides with (or requires deleting) the old one.
 */
export async function uploadCatalogImage(
  organizationId: string,
  kind: "items" | "menus" | "packages",
  file: File,
): Promise<string> {
  const extension = ALLOWED_IMAGE_TYPES[file.type];
  if (!extension) {
    throw new InvalidImageError("Image must be a PNG or JPG file.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new InvalidImageError("Image must be 2MB or smaller.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `organizations/${organizationId}/menu-catalog/${kind}/${crypto.randomUUID()}.${extension}`;
  const uploaded = await getStorageDriver().upload(key, buffer, file.type);
  return uploaded.url;
}
