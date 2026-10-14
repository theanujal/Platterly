import "server-only";
import { headers } from "next/headers";
import { isRateLimited } from "@/lib/rate-limit";

/**
 * One rate limit for the actions behind a public link (no sign-in): at most `limit` calls per hour per visitor
 * address, per `bucket`. Behind Nginx / Cloudflare the real address is the first `x-forwarded-for` entry, and the proxy
 * must overwrite that header rather than append to it.
 */
export async function publicActionLimited(bucket: string, limit = 40, windowMs = 60 * 60 * 1000): Promise<boolean> {
  const forwarded = (await headers()).get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  // No forwarded address means a local dev server (a real proxy always sets it): everyone shares the one "unknown" bucket,
  // so a developer's own repeated tests locked themselves out with "Too many attempts" (AJ, 2026-10-14). Not limited there.
  if (ip === "unknown" && process.env.NODE_ENV !== "production") return false;
  return isRateLimited(`${bucket}:${ip}`, limit, windowMs);
}
