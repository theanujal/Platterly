import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { COOKIES } from "@/modules/auth/config";

/** The Account pages belong to `account.<root>` only. On any other host they answer 404, like an unknown path. */
export async function requireAccountHost(): Promise<void> {
  if (hostKind(requestHost(await headers())) !== "account") notFound();
}

/**
 * Host check, then: nobody who carries no Account session cookie sees an Account page, they are sent to sign in and come back to `path`. This is only
 * the first, cheap step. The cookie is not trusted here; the page's own data call (the verified session) decides, and a stale cookie is sent to sign in
 * by the page itself.
 */
export async function requireAccountSignIn(path: string): Promise<void> {
  await requireAccountHost();
  if (!(await cookies()).get(COOKIES.accountSession)?.value) redirect(`/auth/start?next=${encodeURIComponent(path)}`);
}
