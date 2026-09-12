import "server-only";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { StorageDriver } from "./storage";

// Files land under public/uploads so Next.js serves them directly at
// /uploads/... — fine for local dev where nothing here is sensitive; a real
// S3/R2 driver would return signed URLs instead of relying on static serving.
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

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

  async delete(key) {
    const filePath = assertSafeKey(key);
    await unlink(filePath).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    });
  },
};
