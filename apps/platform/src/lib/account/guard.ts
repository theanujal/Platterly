import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { hostKind, requestHost } from "@/lib/routing/hosts";

/** The Account pages belong to `account.<root>` only. On any other host they answer 404, like an unknown path. */
export async function requireAccountHost(): Promise<void> {
  if (hostKind(requestHost(await headers())) !== "account") notFound();
}
