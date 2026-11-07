import { handlePlanCatalogueRequest } from "@/modules/platform-list/platform-plans";

export const dynamic = "force-dynamic";

/** GET: the plans on sale for the Platform's Store. Signed by the platform with its platform-reader secret; the answer is signed by Ops. */
export async function GET(request: Request) {
  return handlePlanCatalogueRequest(request);
}
