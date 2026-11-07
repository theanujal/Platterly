import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { accountOrigin } from "@/modules/auth/config";
import { identityPool } from "@/modules/auth/identity-db";
import { PHOTO_MAX_BYTES, readPhoto, removePhoto, savePhoto } from "@/modules/account/photo";

// GET /api/account/photo: the signed-in person's own photo. PUT: replace it (the raw image as the body, at most 2 MB). DELETE: remove it. Account host
// only. The person is whoever the verified session says; there is no id in the address, so nobody can ask for someone else's picture.
const NO_STORE = { "cache-control": "no-store" };
const REFUSALS = { too_large: 413, not_an_image: 415, empty: 400 } as const;

async function caller(request: Request, write: boolean) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (write && request.headers.get("origin") !== accountOrigin()) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  return ref;
}

export async function GET(request: Request) {
  const who = await caller(request, false);
  if (who instanceof Response) return who;
  try {
    const photo = await readPhoto(identityPool(), who.sub);
    if (!photo) return Response.json({ status: "none" }, { status: 404, headers: NO_STORE });
    return new Response(new Uint8Array(photo.bytes), { headers: { "content-type": photo.type, "x-content-type-options": "nosniff", "cache-control": "private, no-cache", "content-security-policy": "default-src 'none'; sandbox" } });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

export async function PUT(request: Request) {
  const who = await caller(request, true);
  if (who instanceof Response) return who;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > PHOTO_MAX_BYTES + 1024) return Response.json({ status: "too_large" }, { status: 413, headers: NO_STORE });
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    const result = await savePhoto(identityPool(), who.sub, bytes);
    if (!result.ok) return Response.json({ status: result.reason }, { status: REFUSALS[result.reason], headers: NO_STORE });
    return Response.json({ status: "ok", version: result.version }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

export async function DELETE(request: Request) {
  const who = await caller(request, true);
  if (who instanceof Response) return who;
  try {
    await removePhoto(identityPool(), who.sub);
    return Response.json({ status: "ok" }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}
