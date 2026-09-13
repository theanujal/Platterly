import "server-only";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-session";

/**
 * Chunk 3 Group 3.1 — guard for every page under `src/app/super/(admin)`.
 * `requireSuperAdmin()` throws for both "no session" and "not a Super
 * Admin"; either case bounces back to the `/super` login page. `redirect()`
 * itself throws a special digest Next.js uses to perform the navigation, so
 * it must be called outside the try/catch, not inside it.
 */
export async function requireSuperAdminOrRedirect() {
  const session = await getSuperAdminSession();
  if (!session) {
    redirect("/super");
  }
  return session;
}

async function getSuperAdminSession() {
  try {
    return await requireSuperAdmin();
  } catch {
    return null;
  }
}
