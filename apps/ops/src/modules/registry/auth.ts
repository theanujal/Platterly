import "server-only";
import { CONTRACT_VERSION, verifyRequest } from "@platterly/contract";
import type { Product } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { secretsOf } from "./products";

/**
 * Every route a product calls on ops starts here (docs/ops-contract.md section 3). The request must be signed with that
 * product's own event secret, and the product in the URL must be the one that signed it. An unknown or disabled product, a
 * wrong signature and a stale timestamp all look the same (401). Only then is anything read.
 */
export async function authoriseProductRequest(request: Request, productKey: string, rawBody: string): Promise<{ product: Product; sign: string } | { response: Response }> {
  const unauthorized = { response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  const product = await prisma.product.findUnique({ where: { key: productKey } });
  if (!product || product.status !== "ACTIVE") return unauthorized;
  const secrets = secretsOf(product);
  const verified = verifyRequest(secrets.accept, request.headers, rawBody);
  if (!verified.ok) return unauthorized;
  if (verified.contract > CONTRACT_VERSION) return { response: Response.json({ error: `contract ${verified.contract} is not supported` }, { status: 400 }) };
  return { product, sign: secrets.sign };
}
