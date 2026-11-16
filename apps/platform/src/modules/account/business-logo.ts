import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { sniffImage, type PhotoType } from "./photo";

// A business's logo uploaded in the Account (Business & Billing). The file lives in the Platform's own folder (ACCOUNT_LOGO_DIR, default `.data/account-logos`,
// git-ignored and, in production, on the VPS); Ops stores only the link and the product shows it. PNG, JPEG or WebP, at most 4 MB, the type read from the file's
// own first bytes. The name is random, so the link cannot be guessed and carries no business or person id.
export const LOGO_MAX_BYTES = 4 * 1024 * 1024;
export const logoDir = () => process.env.ACCOUNT_LOGO_DIR ?? path.join(process.cwd(), ".data", "account-logos");
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const satisfies Record<PhotoType, string>;
const KEY = /^[0-9a-f]{32}\.(jpg|png|webp)$/;

export type LogoSave = { ok: true; key: string } | { ok: false; reason: "too_large" | "not_an_image" | "empty" };

export async function saveLogo(bytes: Uint8Array, dir: string = logoDir()): Promise<LogoSave> {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > LOGO_MAX_BYTES) return { ok: false, reason: "too_large" };
  const type = sniffImage(bytes);
  if (!type) return { ok: false, reason: "not_an_image" };
  await mkdir(dir, { recursive: true });
  const key = `${randomBytes(16).toString("hex")}.${EXT[type]}`;
  await writeFile(path.join(dir, key), bytes, { mode: 0o600 });
  return { ok: true, key };
}

export async function readLogo(key: string, dir: string = logoDir()): Promise<{ bytes: Buffer; type: string } | null> {
  if (!KEY.test(key)) return null;
  try {
    const ext = key.split(".")[1];
    return { bytes: await readFile(path.join(dir, key)), type: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg" };
  } catch {
    return null;
  }
}

/** The key of a logo this Platform hosts, read from its link (`.../api/business-logo/{key}`); null for a link to anywhere else (a product's own upload, for example). */
export function logoKeyFromUrl(url: string | null | undefined): string | null {
  const m = /\/api\/business-logo\/([0-9a-f]{32}\.(?:jpg|png|webp))$/.exec((url ?? "").split("?")[0]);
  return m ? m[1] : null;
}

/** Deletes a logo file we host. A missing file is fine. */
export async function deleteLogo(key: string, dir: string = logoDir()): Promise<void> {
  if (!KEY.test(key)) return;
  await rm(path.join(dir, key), { force: true });
}

/** After a profile save: removes the file the profile used to show when it no longer shows it and no other profile of the business still links to it (copying a profile copies the link). */
export async function removeReplacedLogo(oldUrl: string | null | undefined, newUrl: string | null | undefined, otherUrls: (string | null | undefined)[], dir: string = logoDir()): Promise<void> {
  const key = logoKeyFromUrl(oldUrl);
  if (!key || key === logoKeyFromUrl(newUrl) || otherUrls.some((u) => logoKeyFromUrl(u) === key)) return;
  await deleteLogo(key, dir);
}
