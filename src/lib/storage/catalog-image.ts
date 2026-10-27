import { matchesDeclaredType } from "./file-signature";
import "server-only";
import sharp from "sharp";
import { getStorageDriver } from "./storage";

export class InvalidImageError extends Error {}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
/** Wide enough for the largest card or popup on a sharp screen; a camera photo is often 4000px. */
const MAX_WIDTH = 1200;

/**
 * Shared by MenuItem/Menu/EventType/AddOn image uploads — same 4MB PNG/JPG/WebP
 * rule as Chunk 4's business-profile logo upload (Chunk 2.3's storage
 * driver). Keyed by a random id rather than the entity's own id: the entity
 * doesn't exist yet at create time, and a fresh key per upload means an
 * edit's new image never collides with (or requires deleting) the old one.
 *
 * Lives in src/lib/ (relocated from src/modules/menus/), not one module's
 * folder, since the `menus`, `events`, `addons`, and `inventory` modules all
 * use it — matches this project's "src/lib/ = cross-cutting platform
 * services" convention.
 *
 * Every upload is stored as a WebP at most 1200px wide (2026-10-27): a kitchen
 * with hundreds of dishes otherwise sends phones hundreds of full-size photos
 * (one menu imported on live was 158 MB). rotate() applies the photo's EXIF
 * orientation, which is otherwise lost with the metadata.
 */
export async function uploadCatalogImage(
  organizationId: string,
  kind: "items" | "menus" | "event-types" | "add-ons" | "inventory",
  file: File,
): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new InvalidImageError("Image must be a PNG, JPG or WebP file.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new InvalidImageError("Image must be 4MB or smaller.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!matchesDeclaredType(buffer, file.type)) {
    throw new InvalidImageError("That file is not a real PNG, JPG or WebP image.");
  }
  let webp: Buffer;
  try {
    webp = await sharp(buffer).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch {
    throw new InvalidImageError("That image could not be read. Please try another PNG, JPG or WebP file.");
  }
  const key = `organizations/${organizationId}/catalog/${kind}/${crypto.randomUUID()}.webp`;
  const uploaded = await getStorageDriver().upload(key, webp, "image/webp");
  return uploaded.url;
}
