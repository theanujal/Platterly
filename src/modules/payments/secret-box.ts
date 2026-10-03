import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts a kitchen's own Razorpay secrets at rest (AES-256-GCM). The key is PAYMENT_SECRETS_KEY
 * (any long random string); in dev it falls back to a key derived from BETTER_AUTH_SECRET so nothing
 * has to be configured. A stored value looks like `v1.<iv>.<tag>.<ciphertext>` (base64url).
 */
function key(): Buffer {
  const secret = process.env.PAYMENT_SECRETS_KEY ?? process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("PAYMENT_SECRETS_KEY (or BETTER_AUTH_SECRET) must be set to store payment credentials.");
  return createHash("sha256").update(`platterly-payments:${secret}`).digest();
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

/** `rzp_live_abcdef8Fk2` -> `rzp_live_••••••8Fk2` */
export function maskKeyId(keyId: string): string {
  if (keyId.length <= 8) return "••••••••";
  return `${keyId.slice(0, keyId.lastIndexOf("_") + 1)}••••••${keyId.slice(-4)}`;
}
