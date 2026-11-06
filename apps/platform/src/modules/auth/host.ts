import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { hostKind, requestHost, type KnownHostKind } from "@/lib/routing/hosts";

/** Pages that belong to one host answer 404 anywhere else, like an unknown path. */
export async function requireHost(kind: KnownHostKind): Promise<void> {
  if (hostKind(requestHost(await headers())) !== kind) notFound();
}

export const isHost = (request: Request, kind: KnownHostKind) => hostKind(requestHost(request.headers)) === kind;
