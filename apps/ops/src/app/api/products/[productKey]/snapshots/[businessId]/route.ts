import { newId, signedHeaders } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { authoriseProductRequest } from "@/modules/registry/auth";
import { currentSnapshot } from "@/modules/snapshots/issue";

export const dynamic = "force-dynamic";

/**
 * GET: a product pulls the current entitlement snapshot for one of its businesses (the backup to ops's pushes).
 * Signed by the product; the reply is signed by ops. A business the product did not register, or one with no subscription, is 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string }> }) {
  const { productKey, businessId } = await params;
  const auth = await authoriseProductRequest(request, productKey, "");
  if ("response" in auth) return auth.response;

  const link = await prisma.businessProduct.findUnique({ where: { businessId_productKey: { businessId, productKey } } });
  const snapshot = link ? await currentSnapshot(businessId, productKey) : null;
  const text = JSON.stringify(snapshot ?? { error: "not_found" });
  return new Response(text, { status: snapshot ? 200 : 404, headers: signedHeaders(auth.sign, newId("command"), text) });
}
