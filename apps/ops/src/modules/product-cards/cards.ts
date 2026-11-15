import "server-only";
import { CONTRACT_VERSION, requestTarget, signedHeaders, verifyRequest, parseFeatures, type PlatformProductCards } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { readMedia } from "@/modules/site-content/media";
import { readerSecrets } from "@/modules/platform-list/platform-list";

/**
 * What every business's Account shows on My Products (AJ, 2026-11-15). Ops owns it: a live product shows once staff have written its card line, and an
 * upcoming product shows while staff keep it visible. An upcoming product staff switched to live reads as LIVE (no "Coming soon", no countdown).
 */
export async function buildProductCards(now = new Date()): Promise<PlatformProductCards> {
  const [products, upcoming] = await Promise.all([
    prisma.product.findMany({ where: { status: "ACTIVE", tagline: { not: null } }, orderBy: { key: "asc" }, select: { key: true, name: true, tagline: true, cardImage: true, logo: true, about: true, features: true } }),
    prisma.upcomingProduct.findMany({ where: { visible: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const liveKeys = new Set(products.map((p) => p.key));
  return {
    generatedAt: now.toISOString(),
    products: [
      ...products.map((p) => ({ key: p.key, name: p.name, tagline: p.tagline, image: p.cardImage, logo: p.logo, about: p.about, features: parseFeatures(p.features) ?? [], status: "LIVE" as const, launchAt: null })),
      // A key that is already a live product is never listed twice: the live product wins.
      ...upcoming.filter((u) => !liveKeys.has(u.key)).map((u) => ({ key: u.key, name: u.name, tagline: u.tagline, image: u.cardImage, logo: u.logo, about: null, features: [], status: u.upcoming ? ("UPCOMING" as const) : ("LIVE" as const), launchAt: u.upcoming && u.launchAt ? u.launchAt.toISOString() : null })),
    ],
  };
}

async function authenticate(request: Request) {
  const unauthorized = Response.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.NODE_ENV === "production" && request.headers.get("x-forwarded-proto") !== "https") return { response: unauthorized };
  const secrets = await readerSecrets();
  if (!secrets) return { response: unauthorized };
  const verified = verifyRequest(secrets.accept, request.headers, "", { target: requestTarget(request.method, request.url) });
  if (!verified.ok) return { response: unauthorized };
  if (verified.contract > CONTRACT_VERSION) return { response: Response.json({ error: `contract ${verified.contract} is not supported` }, { status: 400 }) };
  return { secrets, id: verified.id };
}

/** GET /api/platform/product-cards: the same scheme as the plan catalogue (signed request in with the platform-reader secret, signed answer out). */
export async function handleProductCardsRequest(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  const text = JSON.stringify(await buildProductCards());
  return new Response(text, { headers: { ...signedHeaders(auth.secrets.sign, auth.id, text), "cache-control": "no-store" } });
}

/**
 * GET /api/platform/product-cards/image/{name}: one uploaded card picture as signed JSON (the file as base64). Only a picture a card actually uses is served,
 * never the rest of the library. The same scheme as the other reads.
 */
export async function handleProductCardImageRequest(request: Request, name: string): Promise<Response> {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  const ref = `upload:${name}`;
  const used = (await prisma.product.count({ where: { OR: [{ cardImage: ref }, { logo: ref }] } })) + (await prisma.upcomingProduct.count({ where: { OR: [{ cardImage: ref }, { logo: ref }], visible: true } }));
  const file = used > 0 ? await readMedia(name) : null;
  if (!file) return Response.json({ error: "not_found" }, { status: 404 });
  const text = JSON.stringify({ mime: file.mime, bytesBase64: file.bytes.toString("base64") });
  return new Response(text, { headers: { ...signedHeaders(auth.secrets.sign, auth.id, text), "cache-control": "no-store" } });
}
