import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { hostKind, requestHost } from "@/lib/routing/hosts";

/** The Store pages belong to `store.<root>` only. On any other host they answer 404, like an unknown path. */
export async function requireStoreHost(): Promise<void> {
  if (hostKind(requestHost(await headers())) !== "store") notFound();
}
