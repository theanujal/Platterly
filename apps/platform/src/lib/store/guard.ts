import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { COOKIES } from "@/modules/auth/config";

/** The Store pages belong to `store.<root>` only. On any other host they answer 404, like an unknown path. */
export async function requireStoreHost(): Promise<void> {
  if (hostKind(requestHost(await headers())) !== "store") notFound();
}

/** Host check, then: nobody who carries no Store session cookie sees a signed-in Store page; they are sent to sign in and come back to `path`. Cheap first step only; the verified session decides. */
export async function requireStoreSignIn(path: string): Promise<void> {
  await requireStoreHost();
  if (!(await cookies()).get(COOKIES.storeSession)?.value) redirect(`/auth/start?next=${encodeURIComponent(path)}`);
}
