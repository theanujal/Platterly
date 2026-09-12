import { notFound } from "next/navigation";

// Placeholder catch-all for public storefronts (Chunk 8). Next.js already
// gives static routes like /super and /kitchenlogin priority over this
// dynamic segment, so the reserved-word guard here is belt-and-suspenders,
// not what actually prevents a collision — Chunk 8's slug-creation
// validation (reusing isReservedPathSegment) is the real gate. No tenant
// storefronts exist yet, so every slug 404s until Chunk 8 lands.
export default async function TenantStorefrontPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  await params;
  notFound();
}
