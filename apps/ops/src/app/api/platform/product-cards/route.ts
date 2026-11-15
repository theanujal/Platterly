import { handleProductCardsRequest } from "@/modules/product-cards/cards";

export const dynamic = "force-dynamic";

/** GET: the product cards for the Platform's Account (My Products). Signed by the platform with its platform-reader secret; the answer is signed by Ops. */
export async function GET(request: Request) {
  return handleProductCardsRequest(request);
}
