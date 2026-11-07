"use client";

import type { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

/**
 * Signs out of Caterly. When the person signed in through the central Platterly sign-in, Better Auth also hands back the provider's end-session address
 * (with the ID token as the hint), and the browser follows it so the central session ends too and every other product is told. Otherwise it is the plain
 * local sign-out Caterly always had.
 */
export async function signOutAndLeave(router: ReturnType<typeof useRouter>): Promise<void> {
  const result = await authClient.signOut({ callbackURL: `${window.location.origin}/`, disableRedirect: true } as never);
  const url = (result as { data?: { url?: string } } | undefined)?.data?.url;
  if (url) {
    window.location.assign(url);
    return;
  }
  router.push("/");
  router.refresh();
}
