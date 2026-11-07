"use client";

import type { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

/**
 * Signs out of Caterly. When the person signed in through the central Platterly sign-in, Better Auth also hands back the provider's end-session address
 * (with the ID token as the hint), and the browser follows it so the central session ends too and every other product is told. A session that did not
 * come from the central sign-in (the old form behind `?legacy=1`) has no central session to end: it ends locally and returns to that same form.
 */
export async function signOutAndLeave(router: ReturnType<typeof useRouter>): Promise<void> {
  const result = await authClient.signOut({ callbackURL: `${window.location.origin}/`, disableRedirect: true } as never);
  const url = (result as { data?: { url?: string } } | undefined)?.data?.url;
  if (url) {
    window.location.assign(url);
    return;
  }
  router.push("/?legacy=1");
  router.refresh();
}
