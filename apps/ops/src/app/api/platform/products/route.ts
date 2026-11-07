import { handleProductListRequest } from "@/modules/platform-list/platform-list";

export const dynamic = "force-dynamic";

/** GET: the product list for the platform. Signed by the platform with its platform-reader secret; the answer is signed by Ops. */
export async function GET(request: Request) {
  return handleProductListRequest(request);
}
