import { createHmac, timingSafeEqual } from "node:crypto";

// A signed address for a person's profile photo, so other Platterly products can show it as a plain <img> without a Platterly session. The address names
// the person and the photo's version and carries a signature made with a key derived from AUTH_SECRET: it cannot be guessed or changed, and it stops
// working the moment the photo is replaced or removed (the version no longer matches). Only the photo itself is reachable through it.
const key = () => {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length >= 32 ? createHmac("sha256", secret).update("photo-link").digest() : null;
};

const sign = (k: Buffer, userId: string, version: string) => createHmac("sha256", k).update(`${userId}.${version}`).digest("base64url");

/** The address a product shows, or null when there is no secret to sign with. */
export function photoLinkUrl(origin: string, userId: string, version: string): string | null {
  const k = key();
  if (!k) return null;
  const query = new URLSearchParams({ u: userId, v: version, s: sign(k, userId, version) });
  return `${origin}/api/account/photo/shared?${query}`;
}

export function verifyPhotoLink(userId: string, version: string, signature: string): boolean {
  const k = key();
  if (!k || !userId || !version || !signature) return false;
  const expected = Buffer.from(sign(k, userId, version));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
