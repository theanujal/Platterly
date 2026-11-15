import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";

// Profile photo: JPEG, PNG or WebP, at most 2 MB, kept as a file in the Platform's own folder (ACCOUNT_PHOTO_DIR, default `.data/account-photos`, which is
// git-ignored and, in production, on the VPS). The type comes from the file's own first bytes, never from what the browser says. The file name is random
// (no person id, no original name). Every query is scoped to the caller's own provider user id.
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const photoDir = () => process.env.ACCOUNT_PHOTO_DIR ?? path.join(process.cwd(), ".data", "account-photos");

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type PhotoType = keyof typeof TYPES;

/** The real type of an image from its first bytes, or null when it is none of the three allowed kinds. */
export function sniffImage(bytes: Uint8Array): PhotoType | null {
  const b = bytes;
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export type SaveResult = { ok: true; version: string } | { ok: false; reason: "too_large" | "not_an_image" | "empty" };

export async function savePhoto(pool: Pool, userId: string, bytes: Uint8Array, dir: string = photoDir()): Promise<SaveResult> {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > PHOTO_MAX_BYTES) return { ok: false, reason: "too_large" };
  const type = sniffImage(bytes);
  if (!type) return { ok: false, reason: "not_an_image" };
  await mkdir(dir, { recursive: true });
  const key = `${randomBytes(16).toString("hex")}.${TYPES[type]}`;
  await writeFile(path.join(dir, key), bytes, { mode: 0o600 });
  const old = await pool.query('select "photoKey" from "accountProfile" where "userId" = $1', [userId]);
  await pool.query('insert into "accountProfile" ("userId") values ($1) on conflict ("userId") do nothing', [userId]);
  const { rows } = await pool.query('update "accountProfile" set "photoKey" = $2, "photoType" = $3, "photoUpdatedAt" = now(), "updatedAt" = now() where "userId" = $1 returning "photoUpdatedAt"', [userId, key, type]);
  const previous = old.rows[0]?.photoKey as string | null | undefined;
  if (previous) await rm(path.join(dir, path.basename(previous)), { force: true });
  return { ok: true, version: String((rows[0].photoUpdatedAt as Date).getTime()) };
}

export async function readPhoto(pool: Pool, userId: string, dir: string = photoDir()): Promise<{ bytes: Buffer; type: string } | null> {
  const { rows } = await pool.query('select "photoKey", "photoType" from "accountProfile" where "userId" = $1', [userId]);
  const row = rows[0] as { photoKey: string | null; photoType: string | null } | undefined;
  if (!row?.photoKey || !row.photoType) return null;
  try {
    return { bytes: await readFile(path.join(dir, path.basename(row.photoKey))), type: row.photoType };
  } catch {
    return null;
  }
}

export async function removePhoto(pool: Pool, userId: string, dir: string = photoDir()): Promise<boolean> {
  const { rows } = await pool.query('select "photoKey" from "accountProfile" where "userId" = $1', [userId]);
  const key = rows[0]?.photoKey as string | null | undefined;
  await pool.query('update "accountProfile" set "photoKey" = null, "photoType" = null, "photoUpdatedAt" = null, "updatedAt" = now() where "userId" = $1', [userId]);
  if (key) await rm(path.join(dir, path.basename(key)), { force: true });
  return !!key;
}

/** The version of the person's current photo (the time it was set, in ms), or null when there is none. */
export async function photoVersion(pool: Pool, userId: string): Promise<string | null> {
  const { rows } = await pool.query('select case when "photoKey" is not null then floor(extract(epoch from "photoUpdatedAt") * 1000)::bigint::text end as v from "accountProfile" where "userId" = $1', [userId]);
  return (rows[0]?.v as string | null | undefined) ?? null;
}

/** The photo only when `version` is still the current one, so an old shared address stops working once the photo changes or is removed. */
export async function readPhotoVersion(pool: Pool, userId: string, version: string, dir: string = photoDir()): Promise<{ bytes: Buffer; type: string } | null> {
  if ((await photoVersion(pool, userId)) !== version) return null;
  return readPhoto(pool, userId, dir);
}
