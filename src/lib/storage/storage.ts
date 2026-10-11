import "server-only";
import { localDriver } from "./local-driver";

export interface StorageDriver {
  /** Stores a file under `key` (should be namespaced by organizationId by the caller) and returns its public URL. */
  upload(key: string, data: Buffer, contentType: string): Promise<{ url: string; key: string }>;
  getUrl(key: string): string;
  delete(key: string): Promise<void>;
  read(key: string): Promise<Buffer>;
}

/** The bytes of a file this platform stored, from the URL it gave out; null for any other URL (a file we do not hold). */
export async function readStoredFile(url: string): Promise<Buffer | null> {
  if (!url.startsWith("/uploads/")) return null;
  try {
    return await getStorageDriver().read(decodeURIComponent(url.slice("/uploads/".length)));
  } catch {
    return null;
  }
}

/**
 * Chunk 2 Group 2.3 — abstracted upload/URL service for menu/product images,
 * logos, and invoice PDFs (Chunk 6, Chunk 14). Ships with a local-filesystem
 * driver for dev (judgment call — no S3/R2 account needed yet); swapping in
 * a real S3/R2 driver later is a one-line change here, no caller changes.
 */
export function getStorageDriver(): StorageDriver {
  return localDriver;
}
