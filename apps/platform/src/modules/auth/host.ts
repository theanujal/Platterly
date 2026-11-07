import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { hostKind, requestHost, type KnownHostKind } from "@/lib/routing/hosts";

/** Pages that belong to one host answer 404 anywhere else, like an unknown path. */
export async function requireHost(kind: KnownHostKind): Promise<void> {
  if (hostKind(requestHost(await headers())) !== kind) notFound();
}

export const isHost = (request: Request, kind: KnownHostKind) => hostKind(requestHost(request.headers)) === kind;

/** Which first-party surface a request to the shared `/auth/*` routes is for: the account host or the store host, nothing else. */
export function surfaceOf(request: Request): "account" | "store" | null {
  const kind = hostKind(requestHost(request.headers));
  return kind === "account" || kind === "store" ? kind : null;
}
