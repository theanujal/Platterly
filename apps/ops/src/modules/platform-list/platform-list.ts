import "server-only";
import { createHash } from "node:crypto";
import { CONTRACT_VERSION, newId, requestTarget, signedHeaders, verifyRequest, type PlatformProductList } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret-box";

const ROW = "default";

/**
 * The platform-reader secrets. They are created and rotated only by the operator CLI (`npm run platform-reader`, see
 * docs/platform-reader-secret.md), never by a request. Until one is provisioned the endpoint answers 401 to everyone.
 * Ops accepts both secrets while a rotation is unfinished and signs its answer with the current one.
 */
export async function readerSecrets(): Promise<{ accept: string[]; sign: string } | null> {
  const row = await prisma.platformReader.findUnique({ where: { id: ROW } });
  if (!row) return null;
  const sign = decryptSecret(row.secret);
  return { accept: row.secretPrevious ? [sign, decryptSecret(row.secretPrevious)] : [sign], sign };
}

/** Every registered product, active or not. No secrets, plans or prices ever go into this. */
export async function buildProductList(now = new Date()): Promise<PlatformProductList> {
  const products = (await prisma.product.findMany({ orderBy: { key: "asc" }, select: { key: true, name: true, baseUrl: true, status: true } })).map((p) => ({
    productKey: p.key,
    name: p.name,
    baseUrl: p.baseUrl,
    active: p.status === "ACTIVE",
  }));
  const hash = createHash("sha256").update(JSON.stringify(products)).digest("hex");
  // One atomic step: only the request that sees a different list bumps the version, so concurrent reads never double-count and a
  // repeat of the same request (the same list) writes nothing.
  await prisma.platformReader.updateMany({
    where: { id: ROW, OR: [{ listHash: null }, { listHash: { not: hash } }] },
    data: { listHash: hash, listVersion: { increment: 1 } },
  });
  const { listVersion } = await prisma.platformReader.findUniqueOrThrow({ where: { id: ROW } });
  return { listVersion, generatedAt: now.toISOString(), products };
}

/**
 * GET /api/platform/products: signed request in (route-bound v2, 300 s window, no nonce store: it is a read-only GET, so a repeat inside
 * the window only reads the same list), signed answer out (v1). Anything wrong looks the same: 401.
 * HTTPS only: in production the request must have come through the proxy over https (Nginx sets `X-Forwarded-Proto https`, see
 * deploy/nginx/platterly.conf). A missing header counts as not https.
 */
export async function handleProductListRequest(request: Request): Promise<Response> {
  const unauthorized = Response.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.NODE_ENV === "production" && request.headers.get("x-forwarded-proto") !== "https") return unauthorized;
  const secrets = await readerSecrets();
  if (!secrets) return unauthorized;
  const verified = verifyRequest(secrets.accept, request.headers, "", { target: requestTarget(request.method, request.url) });
  if (!verified.ok) return unauthorized;
  if (verified.contract > CONTRACT_VERSION) return Response.json({ error: `contract ${verified.contract} is not supported` }, { status: 400 });
  const text = JSON.stringify(await buildProductList());
  return new Response(text, { headers: { ...signedHeaders(secrets.sign, newId("command"), text), "cache-control": "no-store" } });
}
