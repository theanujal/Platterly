"use server";

import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";

/**
 * Chunk 3 Group 3.1. Better Auth's email/password sign-in has no concept of
 * "role" — a regular tenant user's credentials would otherwise authenticate
 * fine at `/super` too. The client-side login form calls
 * `authClient.signIn.email()` first, then this action, to confirm the
 * resulting session actually belongs to a Super Admin before letting it
 * stand. A non-Super-Admin session is signed out immediately rather than
 * left live under `/super`.
 */
export async function verifySuperAdminSessionAction(): Promise<{ ok: false; error: string } | never> {
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  if (!session) {
    return { ok: false, error: "Sign-in failed. Check your email and password." };
  }

  if (!session.user.isSuperAdmin) {
    await auth.api.signOut({ headers: await nextHeaders() });
    return { ok: false, error: "This account is not authorized for Super Admin access." };
  }

  redirect("/super/dashboard");
}
