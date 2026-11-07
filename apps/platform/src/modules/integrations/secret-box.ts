import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts the per-product signing secrets at rest (AES-256-GCM). The key comes from PLATFORM_SECRETS_KEY (required in production), with AUTH_SECRET /
 * BETTER_AUTH_SECRET as the local fallback. A stored value is `v1.<iv>.<tag>.<ciphertext>` (base64url), the same format as Ops and Caterly.
 */
function key(): Buffer {
  // Production never falls back to the sign-in secret: changing that one later would make every stored product secret unreadable.
  const dedicated = process.env.PLATFORM_SECRETS_KEY;
  if (process.env.NODE_ENV === "production" && !dedicated) throw new Error("PLATFORM_SECRETS_KEY must be set in production to store product secrets.");
  const secret = dedicated || process.env.AUTH_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("PLATFORM_SECRETS_KEY (or AUTH_SECRET) must be set to store product secrets.");
  return createHash("sha256").update(`platterly-platform:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unreadable stored secret.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function newSigningSecret(): string {
  return `plsec_${randomBytes(32).toString("base64url")}`;
}
