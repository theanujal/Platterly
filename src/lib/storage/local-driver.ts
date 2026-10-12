import "server-only";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { StorageDriver } from "./storage";

// Files land under public/uploads in dev, so Next.js serves them directly at /uploads/....
// On the VPS (AJ, 2026-10-12: files stay on the server, no cloud bucket) UPLOAD_ROOT points at one persistent, backed-up
// folder outside the release (for example /srv/platterly/uploads) that every blue and green copy shares, and Nginx serves
// /uploads/ from it (a running Next.js does not serve files added to public/ after it started). See deploy/README.md.
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_ROOT?.trim() || path.join(process.cwd(), "public", "uploads"));

function assertSafeKey(key: string) {
  const resolved = path.resolve(UPLOAD_ROOT, key);
  if (!resolved.startsWith(UPLOAD_ROOT + path.sep)) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
  return resolved;
}

export const localDriver: StorageDriver = {
  // contentType is part of the StorageDriver contract (a real S3/R2 driver
  // needs it for the Content-Type header) but static-served local files
  // don't need it.
  async upload(key, data) {
    const filePath = assertSafeKey(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return { url: this.getUrl(key), key };
  },

  getUrl(key) {
    return `/uploads/${key}`;
  },

  async read(key) {
    return readFile(assertSafeKey(key));
  },

  async delete(key) {
    const filePath = assertSafeKey(key);
    await unlink(filePath).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    });
  },
};
